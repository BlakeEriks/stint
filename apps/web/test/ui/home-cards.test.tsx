import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HomeCards } from '@/components/home-cards';
import type { Stats } from '@/lib/client/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function stats(over: Partial<Stats> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
    pace: null,
    billableRatio: null,
    awaitingPayment: 0,
    attention: { overdueInvoices: [], staleDrafts: [], unprojected: null },
    ...over,
  } as Stats;
}

function serve(data: Stats) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      // The Activity strip fetches its own range and the client list.
      const path = String(url);
      if (path.includes('/calendar')) {
        return new Response(JSON.stringify({ days: [] }), { status: 200 });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const overdue = {
  invoiceId: 'i1',
  invoiceNumber: 'STINT-0001',
  clientId: 'c1',
  clientName: 'Northwind',
  amount: 900,
  currency: 'USD',
  daysLate: 12,
};

afterEach(() => vi.unstubAllGlobals());

describe('HomeCards', () => {
  it('renders no attention card when nothing is wrong', async () => {
    serve(
      stats({
        unbilled: {
          total: 100,
          seconds: 3600,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 3600,
              amount: 100,
              unratedCount: 0,
              oldestDays: 2,
            },
          ],
          moreClients: 0,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* A permanent "all clear" card is the SaveIndicator problem — a check
       that is always present says nothing. The card's ABSENCE is the good
       news, so it must not render an empty shell. */
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  it('hides the pace card entirely when no target is set', async () => {
    /* Give it something to render, so "nothing rendered at all" cannot make
       this pass vacuously — the first version of this test asserted only the
       ABSENCE of text and survived a mutation that rendered an empty card. */
    serve(
      stats({
        unbilled: {
          total: 100,
          seconds: 3600,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 3600,
              amount: 100,
              unratedCount: 0,
              oldestDays: 2,
            },
          ],
          moreClients: 0,
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* An empty progress bar asking to be configured is a chore the app
       assigned itself, so the whole SECTION must be gone — not merely its
       text. Counting sections would be fragile (the Activity strip is one
       too), so this asserts on the card's own heading. */
    const headings = [...container.querySelectorAll('h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toContain('Unbilled');
    expect(
      headings.some(
        (h) =>
          h &&
          /^(January|February|March|April|May|June|July|August|September|October|November|December)$/.test(
            h,
          ),
      ),
    ).toBe(false);
    expect(screen.queryByText(/business days/)).toBeNull();
  });

  it('shows how late an overdue invoice is, not just that it exists', async () => {
    serve(
      stats({
        attention: {
          overdueInvoices: [overdue],
          staleDrafts: [],
          unprojected: null,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* The days-late figure is the row. A client name and an amount without it
       is just an invoice, not something needing attention. */
    await waitFor(() =>
      expect(screen.getByText('12 days late')).toBeInTheDocument(),
    );
    expect(screen.getByText('$900.00')).toBeInTheDocument();
  });

  it('links every attention row to the surface that owns it', async () => {
    serve(
      stats({
        attention: {
          overdueInvoices: [overdue],
          staleDrafts: [],
          unprojected: null,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    const link = await screen.findByRole('link', { name: /Northwind/ });
    expect(link).toHaveAttribute('href', '/invoices/i1');
  });

  it('offers no destructive action inline', async () => {
    serve(
      stats({
        attention: {
          overdueInvoices: [overdue],
          staleDrafts: [
            {
              ...overdue,
              invoiceId: 'i2',
              invoiceNumber: 'STINT-0002',
              ageDays: 15,
            },
          ] as never,
          unprojected: null,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* Voiding and deleting are consequential and belong on the invoice
       itself, where the whole document is in view. A card is a glance, and a
       stray click on a glance must not destroy a financial record. */
    await waitFor(() =>
      expect(screen.getByLabelText('Mark paid')).toBeInTheDocument(),
    );
    for (const forbidden of [/void/i, /delete/i, /remove/i, /archive/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
      expect(screen.queryByRole('link', { name: forbidden })).toBeNull();
    }
  });

  it('marks an overdue invoice paid without leaving the screen', async () => {
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
        const path = String(url);
        if (path.includes('/calendar')) {
          return new Response(JSON.stringify({ days: [] }), { status: 200 });
        }
        if (path.includes('/clients')) {
          return new Response(JSON.stringify({ clients: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify(
            stats({
              attention: {
                overdueInvoices: [overdue],
                staleDrafts: [],
                unprojected: null,
              },
            }),
          ),
          { status: 200 },
        );
      }),
    );
    const user = userEvent.setup();
    render(<HomeCards />, { wrapper });

    /* The money usually arrived and was simply never recorded, so this is
       the action that legitimately clears the row — the underlying fact
       changed, rather than the nag being hidden. */
    await user.click(await screen.findByLabelText('Mark paid'));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/invoices/i1/status',
      body: { status: 'paid' },
    });
  });

  it('keeps awaiting-payment separate from the unbilled total', async () => {
    serve(
      stats({
        unbilled: {
          total: 3000,
          seconds: 3600,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 3600,
              amount: 3000,
              unratedCount: 0,
              oldestDays: 2,
            },
          ],
          moreClients: 0,
        },
        awaitingPayment: 900,
      } as never),
    );
    render(<HomeCards />, { wrapper });

    /* Two different kinds of money: unbilled is work not yet invoiced,
       awaiting payment is invoiced and not yet collected. Summing them
       double-counts the same hours, so $3,900 must never appear. */
    const line = await screen.findByText(/awaiting payment/);
    expect(line.textContent).toContain('$900.00');

    // The unbilled headline stays its own figure.
    expect(screen.getAllByText('$3,000.00').length).toBeGreaterThan(0);
    // The sum of the two must appear nowhere.
    expect(screen.queryByText('$3,900.00')).toBeNull();
  });

  it('never spends the accent on a card', async () => {
    serve(
      stats({
        attention: {
          overdueInvoices: [overdue],
          staleDrafts: [],
          unprojected: null,
        },
        pace: {
          unit: 'hours',
          target: 120,
          actual: 60,
          expected: 50,
          delta: 10,
          businessDaysElapsed: 10,
          businessDaysTotal: 22,
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    /* On the home screen the accent is spent, and it is spent on the running
       timer. A green progress bar here would put a second accent meaning on
       the same screen. */
    await waitFor(() =>
      expect(screen.getByText('12 days late')).toBeInTheDocument(),
    );
    const classes = [container, ...container.querySelectorAll('*')].flatMap(
      (el) => Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);
  });

  it('reports being behind against BUSINESS days, not calendar days', async () => {
    serve(
      stats({
        pace: {
          unit: 'hours',
          target: 120,
          actual: 20,
          expected: 49,
          delta: -29,
          businessDaysElapsed: 9,
          businessDaysTotal: 22,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* A 120-hour target is six hours a WORKING day. Reading "behind" on a
       Monday because the weekend passed would be noise pretending to be
       signal, so the denominator is business days. */
    await waitFor(() =>
      expect(
        screen.getByText('9 of 22 business days', { exact: false }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/behind/)).toBeInTheDocument();
    expect(screen.getByText(/-29\.0h/)).toBeInTheDocument();
  });

  it('shows an em-dash, not $0.00, for work with no resolvable rate', async () => {
    serve(
      stats({
        unbilled: {
          total: 0,
          seconds: 3600,
          byClient: [
            {
              clientId: null,
              clientName: 'No client',
              currency: 'USD',
              seconds: 3600,
              amount: 0,
              unratedCount: 1,
              oldestDays: 4,
            },
          ],
          moreClients: 0,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* $0.00 looks like a real figure and understates the total. An em-dash
       says "no rate", and `unratedCount` says the total is incomplete. */
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
    expect(screen.getByText(/1 unrated/)).toBeInTheDocument();
  });
});

describe('card header icons', () => {
  it('leaves the accessible name as the heading text alone', async () => {
    serve(
      stats({
        attention: {
          overdueInvoices: [overdue],
          staleDrafts: [],
          unprojected: null,
        },
        unbilled: {
          total: 100,
          seconds: 3600,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 3600,
              amount: 100,
              unratedCount: 0,
              oldestDays: 2,
            },
          ],
          moreClients: 0,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* The icon is a second channel for a card you are scanning, not part of
       its name. Without `aria-hidden` a screen reader announces "triangle
       alert Needs attention", and lucide's glyphs carry titles that would
       leak in. Queried by exact accessible name, so an icon that starts
       contributing to it fails here. */
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Needs attention' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Unbilled' }),
    ).toBeInTheDocument();
  });
});

describe('the wide layout survives its own empty states', () => {
  /* The cards split into two columns at `lg`. Two of the four hide
     themselves — Needs attention is usually absent thanks to the 7-day grace
     period, and Pace hides when no target is set — so a fixed `grid-cols-2`
     would leave a visible hole on an ordinary day, which is worse than the
     single column it replaced.

     These pin the collapse rules. They assert structure rather than class
     strings: what must hold is that a column never renders empty and that a
     lone card is not left in a narrow one. */
  const oneClient = {
    total: 100,
    seconds: 3600,
    byClient: [
      {
        clientId: 'c1',
        clientName: 'Northwind',
        currency: 'USD',
        seconds: 3600,
        amount: 100,
        unratedCount: 0,
        oldestDays: 2,
      },
    ],
    moreClients: 0,
  };
  const target = {
    unit: 'hours' as const,
    target: 120,
    actual: 21.4,
    delta: -27.7,
    businessDaysElapsed: 9,
    businessDaysTotal: 22,
  };

  /** The grid element the split produces, if it produced one. */
  const splitGrid = (c: HTMLElement) =>
    c.querySelector('.grid.lg\\:grid-cols-\\[1\\.6fr_1fr\\]');

  it('splits into two columns when both sides have a card', async () => {
    serve(stats({ unbilled: oneClient, pace: target }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    const grid = splitGrid(container);
    expect(grid).not.toBeNull();
    /* Exactly two columns, and neither is empty — an empty column div is the
       hole this whole arrangement exists to avoid. */
    const columns = [...(grid?.children ?? [])];
    expect(columns).toHaveLength(2);
    for (const col of columns) {
      expect(col.querySelector('section')).not.toBeNull();
    }
  });

  it('does not split when the left column would be empty', async () => {
    /* Nothing wrong and nothing unbilled: the left column has no card at
       all. Splitting here would put Pace and Activity in a narrow right
       column beside 660px of nothing. */
    serve(stats({ pace: target }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Activity')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Unbilled')).toBeNull();
    expect(splitGrid(container)).toBeNull();
  });

  it('does not split when the right column would be empty', async () => {
    /* Pace is the whole right column — Activity spans the full width below
       it — so with no monthly target there is nothing to put beside the money
       cards and the split is not worth making. */
    serve(stats({ unbilled: oneClient, pace: null }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    expect(screen.queryByText('September')).toBeNull();
    expect(splitGrid(container)).toBeNull();
  });
});
