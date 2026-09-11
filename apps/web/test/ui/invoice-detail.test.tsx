import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceDetail } from '@/components/invoice-detail';
import type { Invoice, InvoiceStatus } from '@/lib/client/api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

function invoice(status: InvoiceStatus): Invoice {
  return {
    id: 'inv-1', clientId: 'c1', invoiceNumber: 'INV-13', sequenceNo: 13,
    status, issueDate: '2026-09-01', dueDate: '2026-10-01',
    periodStart: '2026-08-01', periodEnd: '2026-08-31',
    subtotal: 375, taxRate: 0, taxAmount: 0, total: 375,
    currency: 'USD', notes: null, paymentTerms: 'Net 30',
    groupingMode: 'entry', paymentDetails: null,
    sentAt: null, paidAt: null, createdAt: '2026-09-01T00:00:00Z',
  };
}

function serve(status: InvoiceStatus) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          invoice: invoice(status),
          client: { id: 'c1', name: 'Acme Corp' },
          lineItems: [
            { description: 'Design review', quantitySeconds: 9000,
              quantityHours: 2.5, resolvedRate: 150, rateSource: 'client', amount: 375 },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
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
      expect(await screen.findByRole('link', { name: 'Download PDF' })).toHaveAttribute(
        'href',
        '/api/v1/invoices/inv-1/pdf?download=1',
      );
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

    expect(await screen.findByRole('button', { name: 'Delete draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument();
  });

  it('lets an issued invoice be voided but never deleted', async () => {
    serve('sent');
    show();

    expect(await screen.findByRole('button', { name: 'Void' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete draft' })).not.toBeInTheDocument();
  });

  it('offers the next step in the lifecycle, and only that', async () => {
    serve('draft');
    const { unmount } = show();
    expect(await screen.findByRole('button', { name: 'Mark sent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument();
    unmount();
    vi.unstubAllGlobals();

    serve('sent');
    show();
    expect(await screen.findByRole('button', { name: 'Mark paid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
  });

  /** Void is terminal: nothing may move an invoice out of it. */
  it('offers no transitions at all once void', async () => {
    serve('void');
    show();

    await screen.findByText('INV-13');
    for (const label of ['Mark sent', 'Mark paid', 'Void', 'Delete draft']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('explains that voiding keeps the number and releases the entries', async () => {
    serve('void');
    show();

    expect(await screen.findByText(/numbering is gapless/)).toBeInTheDocument();
  });
});
