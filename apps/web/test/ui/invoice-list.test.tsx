import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { keys } from '@stint/client';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/lib/client/api';
import { localDateKey, localDateTimeToInstant } from '@stint/core';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

vi.mock('next/navigation', () => ({
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

/** The API for a list: each invoice's own route reports to `onDetail`, a
    write to `onWrite`. */
function answerWith(
  list: Invoice[],
  /** May hold the read with a promise, or answer it with a Response. */
  onDetail: (id: string) => unknown,
  onWrite?: () => void,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      if (init?.method && init.method !== 'GET') {
        onWrite?.();
        return new Response('{}');
      }
      if (path.startsWith('/clients'))
        return new Response(
          JSON.stringify({ clients: [{ id: 'c1', name: 'Northwind' }] }),
        );
      const one = path.match(/^\/invoices\/(i\d)/)?.[1];
      if (one) {
        const answer = await onDetail(one);
        if (answer instanceof Response) return answer;
        return new Response(JSON.stringify(list.find((i) => i.id === one)));
      }
      return new Response(JSON.stringify({ invoices: list }));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvoiceList', () => {
  /* The unchanged default (today) must not send an explicit `paidAt` — local
     midnight on the day an invoice was also sent can land before `sentAt`,
     which the server rejects, and the original "now" behaviour is what the
     common case should keep. */
  it('names the invoice in the action, sends no paidAt for the default date, and closes once accepted', async () => {
    const calls = serve([
      invoice(),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', total: 900 }),
    ]);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark paid, STINT-0002' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/invoices/i2/status',
      body: { status: 'paid' },
    });
    expect((calls[0]!.body as { paidAt?: string }).paidAt).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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
      await screen.findByRole('button', { name: 'Mark paid, STINT-0001' }),
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

  it('keeps a refusal in the dialog, and not in the next invoice’s', async () => {
    serve([invoice(), invoice({ id: 'i2', invoiceNumber: 'STINT-0002' })], 422);
    const user = userEvent.setup();
    render(<InvoiceList />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: 'Mark paid, STINT-0001' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rejected');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Mark paid, STINT-0002' }),
    );
    await screen.findByLabelText('Date paid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /* Mark sent locks the draft's entries, so it confirms with their count,
     read from the draft in full, and holds until that count is known. A
     failed read says so, and the confirm stays held. */
  it.each(['answers', 'fails'] as const)(
    'holds Mark sent until the draft read %s',
    async (read) => {
      const draft = invoice({ status: 'draft', invoiceNumber: 'STINT-0001' });
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      const writes: unknown[] = [];
      answerWith(
        [{ ...draft, entryCount: 14 } as Invoice],
        async () => {
          await held;
          if (read === 'fails')
            return new Response(
              JSON.stringify({
                error: { code: 'INTERNAL', message: 'Read failed.' },
              }),
              { status: 500 },
            );
        },
        () => writes.push('write'),
      );
      const calls = vi.mocked(fetch).mock.calls;
      const user = userEvent.setup();
      render(<InvoiceList />, { wrapper });

      await user.click(
        await screen.findByRole('button', { name: 'Mark sent, STINT-0001' }),
      );
      const confirm = await screen.findByRole('button', { name: 'Mark sent' });
      expect(confirm).toBeDisabled();
      expect(screen.queryByText(/Its 0 entries/)).toBeNull();
      release();

      if (read === 'fails') {
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(confirm).toBeDisabled();
        return;
      }
      expect(await screen.findByText(/Its 14 entries/)).toBeInTheDocument();
      await waitFor(() => expect(confirm).toBeEnabled());
      await user.click(confirm);
      await waitFor(() => expect(writes).toHaveLength(1));
      const [url, init] = calls.find(([, i]) => i?.method === 'PATCH')!;
      expect(String(url)).toContain('/invoices/i1/status');
      expect(JSON.parse(String(init!.body))).toEqual({ status: 'sent' });
    },
  );

  /* Once the list paints, each draft and open invoice is fetched in full,
     so opening one shows it with its actions live; a finished one waits. */
  it('prefetches drafts and open invoices, never paid ones', async () => {
    const list = [
      invoice({ id: 'i1', invoiceNumber: 'STINT-0001', status: 'draft' }),
      invoice({ id: 'i2', invoiceNumber: 'STINT-0002', status: 'sent' }),
      invoice({ id: 'i3', invoiceNumber: 'STINT-0003', status: 'paid' }),
    ];
    const fetched: string[] = [];
    answerWith(list, (id) => fetched.push(id));
    render(<InvoiceList />, { wrapper });
    await waitFor(() => expect(fetched.sort()).toEqual(['i1', 'i2']));
  });

  /* Paid from its row, a prefetched invoice opens as the row now says, not
     as the copy fetched while it was still sent. */
  it('drops the prefetched copy of an invoice paid from its row', async () => {
    const list = [invoice({ status: 'sent' })];
    answerWith(
      list,
      () => {},
      () => (list[0] = invoice({ status: 'paid' })),
    );
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={qc}>
        <InvoiceList />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(qc.getQueryData(keys.invoice('i1'))).toBeDefined(),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Mark paid, STINT-0001' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));
    await waitFor(() =>
      expect(qc.getQueryData(keys.invoice('i1'))).toBeUndefined(),
    );
  });
});
