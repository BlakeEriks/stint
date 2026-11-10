import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceDetail } from '@/components/invoice-detail';
import type { Invoice, InvoiceStatus } from '@/lib/client/api';
import { localDateKey } from '@stint/core';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/invoices/inv-1',
}));

function invoice(status: InvoiceStatus, sentAt: string | null = null): Invoice {
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
    expensesSubtotal: 0,
    total: 375,
    currency: 'USD',
    notes: null,
    paymentTerms: 'Net 30',
    groupingMode: 'entry',
    summaryText: null,
    reference: null,
    template: status === 'draft' ? null : 'standard',
    supportingDetail: null,
    paymentDetails: null,
    business: {
      name: 'Sam Rivera',
      address: null,
      email: null,
      logoUrl: null,
    },
    billTo: { name: 'Acme Corp', email: null, address: null },
    sentAt,
    paidAt: null,
    createdAt: '2026-09-01T00:00:00Z',
  };
}

function serve(
  status: InvoiceStatus,
  sentAt: string | null = null,
  extra: Partial<Invoice> = {},
) {
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
          ...invoice(status, sentAt),
          refuses: { download: false, send: false },
          ...extra,
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
  /**
   * The app sends no mail, so downloading IS how an invoice reaches a
   * client — it is the primary action, and it must always be available.
   *
   * A draft holds no number yet, so it is deleted. Once issued, the number
   * is on record and the invoice can only be voided — that is what keeps
   * numbering gapless. Each status offers the next step in its lifecycle,
   * and only that; void is terminal, so nothing moves an invoice out of it.
   */
  it('offers a download in every status, and only the actions its status allows', async () => {
    const actions = ['Delete draft', 'Mark sent', 'Void', 'Mark paid'];
    const offered: Record<InvoiceStatus, string[]> = {
      draft: ['Delete draft', 'Mark sent'],
      sent: ['Void', 'Mark paid'],
      paid: ['Void'],
      void: [],
    };
    for (const [status, expected] of Object.entries(offered)) {
      serve(status as InvoiceStatus);
      const { unmount } = show();
      expect(
        await screen.findByRole('link', { name: 'Download PDF' }),
      ).toHaveAttribute(
        'href',
        // The zone a draft's period is read in, as on every invoice read.
        expect.stringMatching(
          /^\/api\/v1\/invoices\/inv-1\/pdf\?tz=.+&download=1$/,
        ),
      );
      expect(
        actions.filter((name) => screen.queryByRole('button', { name })),
      ).toEqual(expected);
      unmount();
      vi.unstubAllGlobals();
    }
  });

  /* Voiding can't be taken back and deleting removes the draft, so the
     first press only asks: nothing reaches the server until the dialog's. */
  it('voids only from its dialog', async () => {
    const calls = serve('sent');
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole('button', { name: 'Void' }));
    expect(calls).toEqual([]);

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Void' }),
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/invoices/inv-1/status',
      body: { status: 'void' },
    });
  });

  it('deletes a draft only from its dialog', async () => {
    const calls = serve('draft');
    const user = userEvent.setup();
    show();

    await user.click(
      await screen.findByRole('button', { name: 'Delete draft' }),
    );
    expect(calls).toEqual([]);

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete draft',
      }),
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      path: '/invoices/inv-1',
    });
  });

  /* The page stays until the list arrives, and a deleted draft is gone:
     refetching it, or deleting it again, answers "Invoice not found" as if
     the delete had failed. */
  it('holds a deleted draft pending, never asking for it again', async () => {
    serve('draft');
    let deleted = false;
    const answer = vi.mocked(fetch).getMockImplementation()!;
    const askedAfter: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      if (deleted && String(url).includes('/invoices/inv-1')) {
        askedAfter.push(String(url));
      }
      return answer(url, init);
    });
    const user = userEvent.setup();
    show();

    await user.click(
      await screen.findByRole('button', { name: 'Delete draft' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete draft',
      }),
    );
    await waitFor(() => expect(deleted).toBe(true));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(askedAfter).toEqual([]);
  });

  /* Sent Monday 3pm, marked paid on that same Monday from a session running
     Wednesday: local midnight of the picked day is Monday 00:00, which is
     before Monday 3pm and would underflow `sentAt`. The picked date is the
     same calendar day the invoice was sent, so the instant sent must be
     `sentAt` itself, never a midnight that predates it. */
  it('sends sentAt itself when paid is backdated to the day it was sent', async () => {
    const sentAt = '2026-09-14T15:00:00.000Z'; // Monday 3pm UTC
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-16T12:00:00.000Z')); // Wednesday
    const calls = serve('sent', sentAt);
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    const dateInput = await screen.findByLabelText('Date paid');
    const sentDateKey = localDateKey(new Date(sentAt), tz);
    expect(dateInput).toHaveAttribute('min', sentDateKey);

    await user.clear(dateInput);
    await user.type(dateInput, sentDateKey);
    await user.click(screen.getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const body = calls[0]!.body as { status: string; paidAt: string };
    expect(body.status).toBe('paid');
    expect(body.paidAt).toBe(sentAt);
    vi.useRealTimers();
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
  it('renders a dash for a missing or malformed date, and formats a real one', async () => {
    const { shortDate } = await import('@/components/invoice-bits');

    /* A date is decoration on a page whose subject is money. Taking the
       totals, the line items and every action down to report one missing
       date is the wrong trade — the dash is visibly wrong in the one place
       that IS wrong. */
    expect(shortDate(null)).toBe('—');
    expect(shortDate(undefined)).toBe('—');
    expect(shortDate('')).toBe('—');
    // `new Date(NaN, …)` formats as "Invalid Date", which reads as a bug
    // in the invoice rather than in the data.
    expect(shortDate('not-a-date')).toBe('—');
    expect(shortDate('2026-13')).toBe('—');
    expect(shortDate('2026-07-26')).toBe('Jul 26, 2026');
  });
});
