import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NewInvoice } from '@/components/invoice-new';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

const CLIENTS = [
  {
    id: 'c1',
    name: 'Acme Corp',
    email: null,
    address: null,
    hourlyRate: 150,
    taxRate: null,
    currency: 'USD',
    color: null,
    paymentProfileId: null,
    archivedAt: null,
  },
];

const PREVIEW = {
  clientId: 'c1',
  clientName: 'Acme Corp',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  groupingMode: 'entry' as const,
  currency: 'USD',
  lineItems: [
    {
      description: 'Design review',
      quantitySeconds: 9000,
      quantityHours: 2.5,
      resolvedRate: 150,
      rateSource: 'client' as const,
      amount: 375,
    },
  ],
  subtotal: 375,
  taxRate: 0,
  taxAmount: 0,
  total: 375,
  entryCount: 3,
  unratedEntryIds: [] as string[],
};

/** Records POSTs so a test can assert generation did or did not happen. */
function serve(preview = PREVIEW) {
  const posts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'POST') posts.push(path);
      if (path.includes('/invoices/preview')) {
        return new Response(JSON.stringify(preview), { status: 200 });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients: CLIENTS }), {
          status: 200,
        });
      }
      if (path.endsWith('/invoices')) {
        return new Response(JSON.stringify({ id: 'inv-1' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return posts;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A wrapper whose `invalidateQueries` is recorded, for the cache assertions. */
function watched() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidated: string[] = [];
  const real = client.invalidateQueries.bind(client);
  client.invalidateQueries = (filters?: { queryKey?: readonly unknown[] }) => {
    invalidated.push(String(filters?.queryKey?.[0]));
    return real(filters);
  };
  return {
    invalidated,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

const chooseClient = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Client' }));
  await user.click(
    await screen.findByRole('menuitemradio', { name: 'Acme Corp' }),
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('NewInvoice', () => {
  /**
   * Generation allocates a gapless number and locks entries. It must not be
   * reachable until the user has seen what it would produce.
   */
  it('does not offer generation before a preview exists', async () => {
    serve();
    render(<NewInvoice />, { wrapper });

    await screen.findByText('New invoice');
    expect(
      screen.queryByRole('button', { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the line items, and says nothing has been created', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Design review')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing has been created yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate/ }),
    ).toBeInTheDocument();
  });

  /**
   * The approved numbers and the generated numbers must be the same ones.
   * Changing any input after previewing has to withdraw the offer.
   */
  it('withdraws the preview when the period changes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-07-01');

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Generate/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Design review')).not.toBeInTheDocument();
  });

  it('withdraws the preview when the grouping changes', async () => {
    serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    await user.click(screen.getByRole('button', { name: 'Group lines' }));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /By task name/ }),
    );

    expect(
      screen.queryByRole('button', { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  /** An entry with no resolvable rate would bill at zero. Block it. */
  it('blocks generation when any entry has no rate', async () => {
    serve({ ...PREVIEW, unratedEntryIds: ['e1', 'e2'] });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(
      await screen.findByText(/2 entries have no rate/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('blocks generation when the period holds nothing billable', async () => {
    serve({ ...PREVIEW, lineItems: [], subtotal: 0, total: 0, entryCount: 0 });
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Nothing to bill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('generates only when asked, and goes to the new invoice', async () => {
    const posts = serve();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');

    // Previewing alone must never create anything.
    expect(posts.filter((p) => p.endsWith('/invoices'))).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/invoices/inv-1'));
  });

  /**
   * Generation marks the entries invoiced, so every view that counts unbilled
   * work is wrong the moment it returns. Invalidating only `invoices` left the
   * home cards and the calendar still offering work that had just been billed.
   */
  it('refreshes everything derived from the entries it just billed', async () => {
    serve();
    const { invalidated, wrapper: watchedWrapper } = watched();
    const user = userEvent.setup();
    render(<NewInvoice />, { wrapper: watchedWrapper });

    await chooseClient(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Design review');
    await user.click(screen.getByRole('button', { name: /Generate/ }));

    await waitFor(() => expect(invalidated).toContain('invoices'));
    for (const key of ['summary', 'entries', 'stats', 'calendar']) {
      expect(invalidated).toContain(key);
    }
  });
});
