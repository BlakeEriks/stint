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
    attention: { overdueInvoices: [], staleDrafts: [], unprojected: null },
    ...over,
  } as Stats;
}

function serve(data: Stats) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })),
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
       text. Unbilled is the only card with data here. */
    expect(container.querySelectorAll('section')).toHaveLength(1);
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

  it('links every attention row to the surface that fixes it', async () => {
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

    /* Nothing on this screen writes: every action is a link to the surface
       that owns the mutation, because a dashboard that edits data turns a
       stray click into a changed invoice. */
    const link = await screen.findByRole('link', { name: /Northwind/ });
    expect(link).toHaveAttribute('href', '/invoices/i1');
    expect(screen.queryByRole('button')).toBeNull();
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
