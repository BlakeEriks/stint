import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => vi.unstubAllGlobals());

describe('HomeCards', () => {
  it('keeps the pace card with no target, offering a way to set one', async () => {
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

    /* The card stays, carrying the month and a way in: hiding it made the
       feature invisible to the only account that had never set a target.
       What must NOT appear is a bar or a projection — that is the "no empty
       progress bar" rule, and it is about the bar, not the card. */
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
    ).toBe(true);

    expect(screen.queryByText(/business days/)).toBeNull();
    expect(screen.queryByRole('img', { name: /hours/ })).toBeNull();

    // And the way in, which is the entire point of keeping the card.
    expect(
      screen.getByRole('link', { name: 'Edit monthly goal' }),
    ).toHaveAttribute('href', '/settings#goal');
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

    /* The accent is spent on the running timer, in the bar below this screen.
       A green progress bar here would put a second accent meaning in view.

       Waits on the Pace card specifically, so an empty render cannot make it
       pass vacuously. */
    await waitFor(() =>
      expect(screen.getByText(/business days/)).toBeInTheDocument(),
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
    render(<HomeCards />, { wrapper });

    /* The icon is a second channel for a card you are scanning, not part of
       its name. Without `aria-hidden` a screen reader announces "wallet
       Unbilled", and lucide's glyphs carry titles that would leak in.
       Queried by exact accessible name, so an icon that starts contributing
       to it fails here. */
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Unbilled' }),
      ).toBeInTheDocument(),
    );
    /* Its own `waitFor`: the chart resolves a separate query, so asserting
       synchronously here races its first render. */
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Activity' }),
      ).toBeInTheDocument(),
    );
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
    /* 120 * 9/22. `delta` is `actual - expected`, so the two have to agree —
       a fixture that contradicts itself would let a card render a bar from
       one number and a caption from the other and still pass. */
    expected: 49.1,
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
    /* Nothing unbilled: the left column has no card at all, and splitting
       would put Pace in a narrow right column beside 660px of nothing. This
       is now the ONLY arrangement that does not split, since Pace renders
       whether or not a target is set. */
    serve(stats({ pace: target }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Activity')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Unbilled')).toBeNull();
    expect(splitGrid(container)).toBeNull();
  });

  it('still splits with no target, because Pace fills the column', async () => {
    /* Pace is the whole right column and now always renders — with no target
       it carries the line that says what a goal is for — so there is no
       longer an arrangement where the right column is empty. */
    serve(stats({ unbilled: oneClient, pace: null }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    expect(splitGrid(container)).not.toBeNull();
  });
});
