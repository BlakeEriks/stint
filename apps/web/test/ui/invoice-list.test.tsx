import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/lib/client/api';

const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => search.value,
  usePathname: () => '/invoices',
}));

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'i1',
    clientId: 'c1',
    invoiceNumber: 'STINT-0001',
    sequenceNo: 1,
    status: 'sent',
    issueDate: '2026-09-01',
    dueDate: '2026-10-01',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    subtotal: 900,
    taxRate: 0,
    taxAmount: 0,
    total: 900,
    currency: 'USD',
    notes: null,
    paymentTerms: null,
    groupingMode: 'task',
    paymentDetails: null,
    sentAt: null,
    paidAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as Invoice;
}

function serve(invoices: Invoice[]) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(url).replace('/api/v1', '');
      if (method !== 'GET') {
        calls.push({
          method,
          path,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response('{}', { status: 200 });
      }
      if (path.startsWith('/clients')) {
        return new Response(
          JSON.stringify({ clients: [{ id: 'c1', name: 'Northwind' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ invoices }), { status: 200 });
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

afterEach(() => {
  vi.unstubAllGlobals();
  search.value = new URLSearchParams();
});

describe('InvoiceList', () => {
  it('shows open invoices by default, not finished ones', async () => {
    serve([
      invoice(),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', status: 'paid' }),
    ]);
    render(<InvoiceList />, { wrapper });

    /* A paid invoice is finished. Leading with history means scrolling past
       it to reach what still needs doing, and this is the screen you open
       when money lands. */
    await waitFor(() =>
      expect(screen.getByText('STINT-0001')).toBeInTheDocument(),
    );
    expect(screen.queryByText('STINT-0002')).toBeNull();
  });

  it('totals only what is actually owed', async () => {
    serve([
      invoice(),
      invoice({
        id: 'i2',
        invoiceNumber: 'STINT-0002',
        status: 'draft',
        total: 400,
      }),
      invoice({
        id: 'i3',
        invoiceNumber: 'STINT-0003',
        status: 'paid',
        total: 5000,
      }),
    ]);
    render(<InvoiceList />, { wrapper });

    /* Only `sent` is outstanding: a draft has not been asked for and a paid
       one has arrived. Totalling every row would contradict the list. */
    const total = await screen.findByText(/outstanding/);
    expect(total.textContent).toContain('$900.00');
    /* The paid 5000 and the draft 400 must not be in it. */
    expect(total.textContent).not.toContain('5,000');
    expect(total.textContent).not.toContain('1,300');
    expect(total.textContent).not.toContain('6,300');
  });

  it('offers mark-paid only on a sent invoice', async () => {
    serve([
      invoice(),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', status: 'draft' }),
    ]);
    render(<InvoiceList />, { wrapper });

    /* A draft has not been sent, so there is nothing to have been paid. */
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Mark STINT-0001 paid' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Mark STINT-0002 paid' }),
    ).toBeNull();
  });

  it('names the invoice in the action, so identical rows are distinguishable', async () => {
    const calls = serve([
      invoice(),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', total: 900 }),
    ]);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0002 paid' }),
    );

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/invoices/i2/status',
      body: { status: 'paid' },
    });
  });

  it('offers no destructive action in the list', async () => {
    serve([invoice()]);
    render(<InvoiceList />, { wrapper });

    /* Voiding stays on the invoice itself, where the whole document is in
       view — the same rule as the home screen's attention card. */
    await waitFor(() =>
      expect(screen.getByText('STINT-0001')).toBeInTheDocument(),
    );
    for (const forbidden of [/void/i, /delete/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
    }
  });

  it('distinguishes an empty account from an empty filter', async () => {
    serve([invoice({ status: 'paid' })]);
    render(<InvoiceList />, { wrapper });

    /* "No invoices yet" would be a lie when one exists and is simply paid,
       and it would send the user to create a duplicate. */
    await waitFor(() =>
      expect(screen.getByText(/Nothing open/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/No invoices yet/)).toBeNull();
  });
});
