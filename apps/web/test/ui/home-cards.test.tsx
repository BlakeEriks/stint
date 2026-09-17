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
    velocity: {
      months: 3,
      total: 0,
      invoiced: 0,
      unbilled: 0,
      seconds: 0,
      byClient: [],
      moreClients: 0,
    },
    pace: null,
    billableRatio: null,
    awaitingPayment: 0,
    attention: { overdueInvoices: [], staleDrafts: [], unprojected: null },
    ...over,
  } as Stats;
}

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

/** A month's worth of business days, cumulative actual against the ray. */
function series(points: number) {
  return Array.from({ length: points }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    actual: i < 9 ? (i + 1) * 2.4 : null,
    expected: (i + 1) * 5.45,
  }));
}

/** `days` for the heatmap's /calendar call, keyed by date. */
function serve(
  data: Stats,
  days: {
    date: string;
    totalSeconds: number;
    byClient: Record<string, number>;
  }[] = [],
  clients: { id: string; name: string; color: string }[] = [],
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      // The heatmap fetches a year of days and the client list.
      if (path.includes('/calendar')) {
        return new Response(JSON.stringify({ days }), { status: 200 });
      }
      if (path.includes('/clients')) {
        /* The real route hides archived clients unless asked, so the fake does
           too — otherwise a caller that stopped asking still gets them back
           and the archived-colour test passes against the bug. */
        const asked = path.includes('includeArchived=true');
        return new Response(JSON.stringify({ clients: asked ? clients : [] }), {
          status: 200,
        });
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
  it('keeps the month region with no target, offering a way to set one', async () => {
    /* Give it something to render, so "nothing rendered at all" cannot make
       this pass vacuously — the first version of this test asserted only the
       ABSENCE of text and survived a mutation that rendered an empty card. */
    serve(stats({ unbilled: oneClient }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* The region stays, carrying the month and a way in: hiding it made the
       feature invisible to the only account that had never set a target.
       What must NOT appear is a plot or a projection. */
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
    expect(screen.queryByRole('img', { name: /of / })).toBeNull();

    // And the way in, which is the entire point of keeping the region.
    expect(
      screen.getByRole('link', { name: 'Edit monthly goal' }),
    ).toHaveAttribute('href', '/settings#goal');
  });

  it('keeps awaiting-payment separate from the unbilled total', async () => {
    serve(
      stats({
        unbilled: {
          ...oneClient,
          total: 3000,
          byClient: [{ ...oneClient.byClient[0], amount: 3000 }],
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

    expect(screen.getAllByText('$3,000.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$3,900.00')).toBeNull();
  });

  it('never spends the accent on a region', async () => {
    serve(
      stats({
        unbilled: oneClient,
        pace: {
          unit: 'hours',
          target: 120,
          actual: 21.6,
          expected: 49.1,
          delta: -27.5,
          businessDaysElapsed: 9,
          businessDaysTotal: 22,
          series: series(22),
        },
        velocity: {
          months: 3,
          total: 9000,
          invoiced: 6000,
          unbilled: 3000,
          seconds: 360000,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 360000,
              invoiced: 6000,
              unbilled: 3000,
              unratedCount: 0,
            },
          ],
          moreClients: 0,
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    /* The accent is spent on the running timer, in the bar below this screen.
       A green line or a green cell would put a second accent meaning in view.

       Waits on the month region specifically, so an empty render cannot make
       this pass vacuously. */
    await waitFor(() =>
      expect(screen.getByText(/business days/)).toBeInTheDocument(),
    );
    const els = [container, ...container.querySelectorAll('*')];
    const classes = els.flatMap((el) =>
      Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);

    /* Every attribute, not just `style` and `class`: the plot paints through
       SVG's `stroke` and `fill`, so a scan of inline styles alone passed
       against an accent-stroked line. Success cyan belongs to the paid beat
       and appears nowhere in this set either. */
    const painted = els
      .flatMap((el) => [...((el as Element).attributes ?? [])])
      .map((a) => a.value)
      .join(' ');
    expect(painted).not.toMatch(/accent|success/);
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
          series: series(22),
        },
      }),
    );
    render(<HomeCards />, { wrapper });

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

describe('the panel is one surface', () => {
  /* The content column IS the panel. A region that draws its own border,
     background or shadow puts a card inside a card, which is the exact
     disjointedness the floating frame removed. */
  it('gives no region a border, background or shadow of its own', async () => {
    serve(
      stats({
        unbilled: oneClient,
        pace: {
          unit: 'hours',
          target: 120,
          actual: 21.6,
          expected: 49.1,
          delta: -27.5,
          businessDaysElapsed: 9,
          businessDaysTotal: 22,
          series: series(22),
        },
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    const sections = [...container.querySelectorAll('section')];
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      const classes = [...s.classList];
      expect(classes.filter((c) => c.startsWith('bg-'))).toEqual([]);
      expect(classes.filter((c) => c.startsWith('shadow-'))).toEqual([]);
      expect(classes.filter((c) => /^border(-|$)/.test(c))).toEqual([]);
      expect(classes.filter((c) => c.startsWith('rounded-'))).toEqual([]);
    }
  });

  it('separates regions with an INSET rule, never a full-bleed one', async () => {
    serve(stats({ unbilled: oneClient }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* A full-bleed rule cuts the panel in two and reads as two stacked cards.
       Every separator carries the rows' own `mx-4`. */
    const rules = [...container.querySelectorAll('div.border-t')];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect([...r.classList]).toContain('mx-4');
    }
  });
});

describe('Velocity', () => {
  const velocity = {
    months: 3,
    total: 9000,
    invoiced: 6000,
    unbilled: 3000,
    seconds: 360000,
    byClient: [
      {
        clientId: 'c1',
        clientName: 'Northwind',
        currency: 'USD',
        seconds: 360000,
        invoiced: 6000,
        unbilled: 3000,
        unratedCount: 0,
      },
    ],
    moreClients: 0,
  };

  it('says "gross earned", never "earned" alone', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    /* "Earned" alone claims money collected. This window is work DONE, part
       of it not yet invoiced and none of it necessarily paid — the same
       overstatement the Unbilled card refuses. */
    const heading = await screen.findByRole('heading', { name: /earned/i });
    expect(heading.textContent?.toLowerCase()).toContain('gross earned');
  });

  it('splits the window into invoiced and unbilled without double-counting', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/invoiced/)).toBeInTheDocument(),
    );
    /* `invoiced + unbilled` IS the total; the split moves as invoices are
       raised while the total does not. */
    expect(screen.getAllByText('$9,000.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$6,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('$3,000.00').length).toBeGreaterThan(0);
    // The two halves summed on top of the total would be $15,000.
    expect(screen.queryByText('$15,000.00')).toBeNull();
  });
});

describe('the heatmap', () => {
  /** A worked day `ago` days before today, in the browser's zone. */
  function dayAgo(ago: number, byClient: Record<string, number>) {
    const at = new Date();
    at.setDate(at.getDate() - ago);
    const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    const totalSeconds = Object.values(byClient).reduce((a, b) => a + b, 0);
    return { date, totalSeconds, byClient };
  }

  it('keeps an archived client’s colour rather than reassigning its hours', async () => {
    serve(
      stats({ unbilled: oneClient }),
      [dayAgo(1, { c1: 7200 })],
      // Archived, and still the only source of this colour.
      [{ id: 'c1', name: 'Northwind', color: 'rgb(10, 20, 30)' }],
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Northwind')).toBeInTheDocument(),
    );

    /* Dropping an archived client's hue would silently move its hours into
       the neutral band — the year would misreport whose work it was. */
    await waitFor(() => {
      const painted = [...container.querySelectorAll('[style]')].some((el) =>
        (el.getAttribute('style') ?? '').includes('rgb(10, 20, 30)'),
      );
      expect(painted).toBe(true);
    });
  });

  it('survives one missed day and breaks on two', async () => {
    /* The streak is the figure in the header. Breaking on a single missed day
       punishes one appointment and stops being a number anyone trusts; two
       is a stop. Days 1,2 worked, day 3 missed, day 4 worked — a 3-day
       streak across the gap. Days 5 and 6 are both missed, so nothing before
       them counts. */
    serve(stats({ unbilled: oneClient }), [
      dayAgo(1, { c1: 3600 }),
      dayAgo(2, { c1: 3600 }),
      dayAgo(4, { c1: 3600 }),
      dayAgo(7, { c1: 3600 }),
      dayAgo(8, { c1: 3600 }),
    ]);
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('3 day streak')).toBeInTheDocument(),
    );
  });

  it('gives a split day the client with the most hours', async () => {
    /* A cell is ~11px and cannot carry a stack, so the majority takes it.
       `c2` has more of this day and must be the hue that lands. */
    serve(
      stats({ unbilled: oneClient }),
      [dayAgo(1, { c1: 1800, c2: 7200 })],
      [
        { id: 'c1', name: 'Northwind', color: 'rgb(1, 1, 1)' },
        { id: 'c2', name: 'Contoso', color: 'rgb(2, 2, 2)' },
      ],
    );
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Contoso')).toBeInTheDocument(),
    );

    await waitFor(() => {
      const styles = [...container.querySelectorAll('.aspect-square[style]')]
        .map((el) => el.getAttribute('style') ?? '')
        .join(' ');
      expect(styles).toContain('rgb(2, 2, 2)');
      expect(styles).not.toContain('rgb(1, 1, 1)');
    });
  });
});
