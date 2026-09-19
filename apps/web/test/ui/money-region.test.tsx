import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HomeCards } from '@/components/home-cards';
import type { Stats } from '@/lib/client/api';

/**
 * The Money region: the pairing, the plot's scale, and the lines under the
 * two owed figures. `docs/design/screens/money.html` is the spec.
 */

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

/* The panel makes three calls, not one: the heatmap fetches a year of days
   and the client list alongside `/stats`. Answering all of them with the
   stats body crashes `Heatmap` on `data.days.map` and takes the tree down —
   which looks exactly like the region failing to render. */
function serve(body: Stats) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/calendar')) {
        return new Response(JSON.stringify({ days: [] }), { status: 200 });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

const MONTHS = [
  { month: '2026-04', amount: 6400 },
  { month: '2026-05', amount: 7100 },
  { month: '2026-06', amount: 4200 },
  { month: '2026-07', amount: 7100 },
  { month: '2026-08', amount: 7800 },
  { month: '2026-09', amount: 6400 },
];

function stats(over: Partial<Stats> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: {
      total: 3461.25,
      seconds: 7200,
      byClient: [
        {
          clientId: 'c1',
          clientName: 'Northwind Trading',
          currency: 'USD',
          seconds: 7200,
          amount: 1991.25,
          unratedCount: 0,
          oldestDays: 12,
        },
      ],
      moreClients: 0,
    },
    byProject: {
      seconds: 0,
      amount: 0,
      byProject: [],
      moreProjects: 0,
      tailSeconds: 0,
      tailAmount: 0,
    },
    earnedToday: 0,
    velocity: {
      months: 3,
      total: 0,
      perMonth: 0,
      invoiced: 0,
      unbilled: 0,
      seconds: 0,
      byClient: [],
      moreClients: 0,
    },
    pace: null,
    billableRatio: null,
    awaitingPayment: 6400,
    openInvoiceCount: 1,
    collected: {
      trailing12: 70500,
      thisMonth: 6400,
      daysSincePaid: 14,
      byMonth: MONTHS,
    },
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
    },
    ...over,
  } as Stats;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Money region', () => {
  it('leads with collected and pairs it with what is owed', async () => {
    serve(stats());
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    /* Collected is the only money figure at `type-figure`: it is the one
       number here that is finished. The owed pair sits a size down. */
    const head = screen.getByText(/^Collected/).closest('header');
    await waitFor(() =>
      expect(head?.querySelector('.type-figure')?.textContent).toContain(
        '$70,500.00',
      ),
    );
    /* Awaiting and unbilled, at equal weight: one is money asked for and the
       other money not yet asked for, and the difference is a stage rather
       than a size. */
    /* Awaiting and unbilled, at equal weight: one is money asked for and the
       other money not yet asked for, and the difference is a stage rather
       than a size. */
    expect(screen.getByText('Awaiting')).toBeVisible();
    expect(document.querySelectorAll('.type-amount-hero').length).toBe(2);
  });

  it('counts the open invoices rather than describing the worst', async () => {
    serve(stats({ awaitingPayment: 9000, openInvoiceCount: 3 }));
    render(<HomeCards />, { wrapper });

    /* Naming one invoice says nothing about the others, and at two or more
       it drops them silently. */
    await waitFor(() =>
      expect(screen.getByText('3 open invoices')).toBeVisible(),
    );
    expect(screen.getByText('12d oldest')).toBeVisible();
  });

  it('says a month with no payments plainly, never as $0.00', async () => {
    serve(
      stats({
        collected: {
          trailing12: 64100,
          thisMonth: 0,
          daysSincePaid: 38,
          byMonth: MONTHS,
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    /* `+$0.00 this month` reads as a payment worth nothing rather than as a
       month without one. */
    await waitFor(() =>
      expect(screen.getByText(/nothing collected this month/)).toBeVisible(),
    );
    expect(screen.getByText(/last paid 38d ago/)).toBeVisible();
    expect(screen.queryByText(/\+\$0\.00 this month/)).toBeNull();
  });

  it('draws every month, and never flattens the lowest onto the axis', async () => {
    serve(stats());
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    const plot = container.querySelector('svg[role="img"]');
    const dots = plot?.querySelectorAll('circle') ?? [];
    expect(dots.length).toBe(MONTHS.length);

    /* The base sits BELOW the lowest month, so June — the light one — is
       visibly lower than the rest and still visibly a month. At a base of
       the minimum it would render flat on the axis and read as no income. */
    const ys = [...dots].map((d) => Number(d.getAttribute('cy')));
    const axis = 86 - 8;
    expect(Math.max(...ys)).toBeLessThan(axis);
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
  });

  it('sits a month with no payment on the axis, never above it', async () => {
    /* The shape a new account has: one payment, five empty months. Padding
       the base below a minimum of zero would lift those months off the floor
       and claim each had collected something. */
    serve(
      stats({
        collected: {
          trailing12: 3195,
          thisMonth: 3195,
          daysSincePaid: 15,
          byMonth: [
            { month: '2026-04', amount: 0 },
            { month: '2026-05', amount: 0 },
            { month: '2026-06', amount: 0 },
            { month: '2026-07', amount: 0 },
            { month: '2026-08', amount: 0 },
            { month: '2026-09', amount: 3195 },
          ],
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    const dots = [...container.querySelectorAll('svg[role="img"] circle')];
    const axis = 86 - 8;
    const ys = dots.map((d) => Number(d.getAttribute('cy')));
    expect(ys.slice(0, -1).every((y) => y === axis)).toBe(true);
    expect(ys.at(-1)).toBeLessThan(axis);
  });

  it('leaves the open month hollow', async () => {
    serve(stats());
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    /* The current month is still being collected, and a filled dot would
       claim it had settled. */
    const dots = [
      ...(container.querySelectorAll('svg[role="img"] circle') ?? []),
    ];
    const open = dots.at(-1);
    expect(open?.getAttribute('class')).toMatch(/fill-surface-primary/);
    for (const d of dots.slice(0, -1)) {
      expect(d.getAttribute('class')).toMatch(/fill-success/);
    }
  });

  it('centres each month label on its own point', async () => {
    serve(stats());
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    /* The points sit at `i/(n-1)` and so touch both edges of the plot, while
       equal columns would centre their labels a half-column in from each —
       a drift that leaves no label clearly owning a dot. jsdom reports no
       geometry, so this asserts the positioning RULE instead: each label is
       placed at its own point's fraction of the width. */
    const labels = [
      ...container.querySelectorAll('div.relative > span'),
    ] as HTMLElement[];
    expect(labels.length).toBe(6);
    expect(labels.map((l) => l.style.left)).toEqual([
      '0%',
      '20%',
      '40%',
      '60%',
      '80%',
      '100%',
    ]);

    /* The ends pull back inside the box rather than centring, so neither
       overhangs the plot. */
    expect(labels[0]?.style.transform).toBe('none');
    expect(labels.at(-1)?.style.transform).toBe('translateX(-100%)');
    for (const l of labels.slice(1, -1)) {
      expect(l.style.transform).toBe('translateX(-50%)');
    }
  });

  it('names the client list for the one figure it breaks down', async () => {
    serve(stats());
    render(<HomeCards />, { wrapper });

    /* Both figures above it are money owed. Unnamed, the list reads as a
       breakdown of the pair — and the same client can appear in both at
       different amounts. */
    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );
  });

  it('renders collected at zero rather than hiding the half', async () => {
    serve(
      stats({
        collected: {
          trailing12: 0,
          thisMonth: 0,
          daysSincePaid: null,
          byMonth: [],
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeVisible(),
    );

    /* With the left half gone the grid puts Owed in its place, and the screen
       reads as though money owed were what arrived. */
    const pair = [...container.querySelectorAll('div.grid')].find((d) =>
      [...d.classList].some((c) => c.includes('grid-cols-')),
    );
    const headings = [...(pair?.querySelectorAll('h2') ?? [])].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings[0]).toMatch(/^Collected/);
    // No shape to draw from a single point, so the plot stays away.
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });
});
