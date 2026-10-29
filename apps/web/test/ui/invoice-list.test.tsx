import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InvoiceDetail } from '@/components/invoice-detail';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/lib/client/api';
import { localDateKey, localDateTimeToInstant } from '@stint/core';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

const search = { value: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
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

function serve(invoices: Invoice[], status = 200) {
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
        return new Response('{}', { status });
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
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/invoices/i2/status',
      body: { status: 'paid' },
    });
  });

  /* The unchanged default (today) must not send an explicit `paidAt` — local
     midnight on the day an invoice was also sent can land before `sentAt`,
     which the server rejects, and the original "now" behaviour is what the
     common case should keep. */
  it('sends no paidAt when the default date is left unchanged', async () => {
    const calls = serve([invoice()]);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0001 paid' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls[0]!;
    const body = call.body as { status: string; paidAt?: string };
    expect(body.status).toBe('paid');
    expect(body.paidAt).toBeUndefined();
  });

  /* The whole point of the dialog: a payment that arrived earlier than today
     must be recorded on the day it actually happened, not the day someone
     got around to clicking the button — otherwise every days-to-pay average
     measures the user's habits instead of the client's. */
  it('asks when the payment arrived, defaulting to today, and sends that date', async () => {
    const calls = serve([invoice()]);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0001 paid' }),
    );

    const dateInput = await screen.findByLabelText('Date paid');
    const today = localDateKey(new Date(), tz);
    expect(dateInput).toHaveValue(today);

    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-03');
    await user.click(screen.getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const call = calls[0]!;
    expect(call.method).toBe('PATCH');
    expect(call.path).toBe('/invoices/i1/status');
    const body = call.body as { status: string; paidAt: string };
    expect(body.status).toBe('paid');
    /* Local midnight of the picked date, not a UTC-day slice — a naive
       string comparison gives the wrong day for anyone east of UTC. */
    expect(body.paidAt).toBe(
      localDateTimeToInstant('2026-09-03', '00:00', tz).toISOString(),
    );
  });

  it('closes the dialog once the server accepts the payment', async () => {
    serve([invoice()]);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0001 paid' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps a refusal in the dialog, and not in the next invoice’s', async () => {
    serve([invoice(), invoice({ id: 'i2', invoiceNumber: 'STINT-0002' })], 422);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0001 paid' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rejected');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Mark STINT-0002 paid' }),
    );
    await screen.findByLabelText('Date paid');
    expect(screen.queryByRole('alert')).toBeNull();
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

  /* Once the list paints, each draft and open invoice is fetched in full,
     so opening one shows it with its actions live; a finished one waits. */
  it('prefetches drafts and open invoices, never paid ones', async () => {
    const list = [
      invoice({ id: 'i1', invoiceNumber: 'STINT-0001', status: 'draft' }),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', status: 'sent' }),
      invoice({ id: 'i3', invoiceNumber: 'STINT-0003', status: 'paid' }),
    ];
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = String(url).replace('/api/v1', '');
        if (path.startsWith('/clients'))
          return new Response(
            JSON.stringify({ clients: [{ id: 'c1', name: 'Northwind' }] }),
          );
        const one = path.match(/^\/invoices\/(i\d)/)?.[1];
        if (one) {
          fetched.push(one);
          return new Response(
            JSON.stringify({
              ...list.find((i) => i.id === one),
              billTo: { name: 'Northwind', email: null, address: null },
              business: {
                name: 'Sam',
                address: null,
                email: null,
                logoUrl: null,
              },
              lineItems: [],
              canDownload: true,
              changedSinceDownload: null,
              unratedEntries: [],
              dueBeforeIssue: { download: false, send: false },
              refuses: { download: false, send: false },
            }),
          );
        }
        return new Response(JSON.stringify({ invoices: list }));
      }),
    );
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <InvoiceList />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(fetched.sort()).toEqual(['i1', 'i2']));
    unmount();

    for (const [id, action] of [
      ['i1', 'Mark sent'],
      ['i2', 'Mark paid'],
    ] as const) {
      const page = render(
        <QueryClientProvider client={qc}>
          <InvoiceDetail id={id} />
        </QueryClientProvider>,
      );
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('button', { name: action })).toBeEnabled();
      expect(screen.getByRole('link', { name: 'Download PDF' })).toBeVisible();
      page.unmount();
    }
    expect(fetched).not.toContain('i3');
  });
});
