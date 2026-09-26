import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceDetail } from '@/components/invoice-detail';
import type { Invoice, InvoiceStatus } from '@/lib/client/api';
import { localDateKey } from '@stint/core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

function invoice(status: InvoiceStatus): Invoice {
  return {
    id: 'inv-1',
    clientId: 'c1',
    invoiceNumber: 'INV-13',
    sequenceNo: 13,
    status,
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    subtotal: 375,
    taxRate: 0,
    taxAmount: 0,
    total: 375,
    currency: 'USD',
    notes: null,
    paymentTerms: 'Net 30',
    groupingMode: 'entry',
    paymentDetails: null,
    sentAt: null,
    paidAt: null,
    createdAt: '2026-09-01T00:00:00Z',
  };
}

function serve(status: InvoiceStatus) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        calls.push({
          method,
          path: String(url).replace('/api/v1', ''),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response('{}', { status: 200 });
      }
      return new Response(
        JSON.stringify({
          /* FLAT, matching the route: a stub is only as good as its
             fidelity to the endpoint. */
          ...invoice(status),
          client: { id: 'c1', name: 'Acme Corp' },
          lineItems: [
            {
              description: 'Design review',
              unit: 'hour' as const,
              quantity: 2.5,
              unitPrice: 150,
              rateSource: 'client',
              amount: 375,
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  return calls;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const show = () => render(<InvoiceDetail id="inv-1" />, { wrapper });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('InvoiceDetail', () => {
  it('shows the frozen line items and total', async () => {
    serve('draft');
    show();

    expect(await screen.findByText('Design review')).toBeInTheDocument();
    expect(screen.getAllByText('$375.00').length).toBeGreaterThan(0);
  });

  /**
   * The app sends no mail, so downloading IS how an invoice reaches a
   * client — it is the primary action, and it must always be available.
   */
  it('offers a download in every status', async () => {
    for (const status of ['draft', 'sent', 'paid', 'void'] as InvoiceStatus[]) {
      serve(status);
      const { unmount } = show();
      expect(
        await screen.findByRole('link', { name: 'Download PDF' }),
      ).toHaveAttribute('href', '/api/v1/invoices/inv-1/pdf?download=1');
      unmount();
      vi.unstubAllGlobals();
    }
  });

  /**
   * A draft holds no number yet, so it is deleted. Once issued, the number
   * is on record and the invoice can only be voided — that is what keeps
   * numbering gapless.
   */
  it('lets a draft be deleted but not voided', async () => {
    serve('draft');
    show();

    expect(
      await screen.findByRole('button', { name: 'Delete draft' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Void' }),
    ).not.toBeInTheDocument();
  });

  it('lets an issued invoice be voided but never deleted', async () => {
    serve('sent');
    show();

    expect(
      await screen.findByRole('button', { name: 'Void' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete draft' }),
    ).not.toBeInTheDocument();
  });

  it('offers the next step in the lifecycle, and only that', async () => {
    serve('draft');
    const { unmount } = show();
    expect(
      await screen.findByRole('button', { name: 'Mark sent' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark paid' }),
    ).not.toBeInTheDocument();
    unmount();
    vi.unstubAllGlobals();

    serve('sent');
    show();
    expect(
      await screen.findByRole('button', { name: 'Mark paid' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark sent' }),
    ).not.toBeInTheDocument();
  });

  /** Void is terminal: nothing may move an invoice out of it. */
  it('offers no transitions at all once void', async () => {
    serve('void');
    show();

    await screen.findByText('INV-13');
    for (const label of ['Mark sent', 'Mark paid', 'Void', 'Delete draft']) {
      expect(
        screen.queryByRole('button', { name: label }),
      ).not.toBeInTheDocument();
    }
  });

  it('explains that voiding keeps the number and releases the entries', async () => {
    serve('void');
    show();

    expect(await screen.findByText(/numbering is gapless/)).toBeInTheDocument();
  });

  /* Nothing asked before, so `paid_at` was always the click, not the
     payment. The dialog defaults to today and lets a backdated payment be
     recorded as what it actually was. */
  it('asks when the payment arrived before recording it as paid', async () => {
    const calls = serve('sent');
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    const dateInput = await screen.findByLabelText('Date paid');
    const today = localDateKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(dateInput).toHaveValue(today);

    await user.clear(dateInput);
    await user.type(dateInput, '2026-08-20');
    await user.click(screen.getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls[0]!;
    expect(call.method).toBe('PATCH');
    expect(call.path).toBe('/invoices/inv-1/status');
    const body = call.body as { status: string; paidAt: string };
    expect(body.status).toBe('paid');
    expect(body.paidAt.slice(0, 10)).toBe('2026-08-20');
  });
});

/**
 * `shortDate` renders a date that may be absent.
 *
 * The schema marks invoice periods required and `POST /invoices` always sets
 * them, so a null can only arrive from data the API could not have produced —
 * which is exactly what a seed script wrote, and the detail page threw
 * `can't access property "split", date is null` on the whole invoice.
 */
describe('shortDate', () => {
  it('renders a dash rather than throwing on a missing date', async () => {
    const { shortDate } = await import('@/components/invoice-bits');

    /* A date is decoration on a page whose subject is money. Taking the
       totals, the line items and every action down to report one missing
       date is the wrong trade — the dash is visibly wrong in the one place
       that IS wrong. */
    expect(shortDate(null)).toBe('—');
    expect(shortDate(undefined)).toBe('—');
    expect(shortDate('')).toBe('—');
  });

  it('renders a dash for a malformed date rather than "Invalid Date"', async () => {
    const { shortDate } = await import('@/components/invoice-bits');

    // `new Date(NaN, …)` formats as "Invalid Date", which reads as a bug
    // in the invoice rather than in the data.
    expect(shortDate('not-a-date')).toBe('—');
    expect(shortDate('2026-13')).toBe('—');
  });

  it('still formats a real date', async () => {
    const { shortDate } = await import('@/components/invoice-bits');
    expect(shortDate('2026-07-26')).toBe('Jul 26, 2026');
  });
});
