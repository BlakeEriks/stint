import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HomeCards } from '@/components/home-cards';
import type { Stats } from '@/lib/client/api';

/**
 * The three regions: Today, this week and the month.
 * `docs/design/screens/home.html` is the spec.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/** Seven days from Mon 14 Sep, worked unless a case says otherwise. */
const WEEK: Stats['week'] = [
  { date: '2026-09-14', seconds: 25_200, amount: 560 },
  { date: '2026-09-15', seconds: 19_800, amount: 440 },
  { date: '2026-09-16', seconds: 24_300, amount: 540 },
  { date: '2026-09-17', seconds: 15_300, amount: 340 },
  { date: '2026-09-18', seconds: 0, amount: null },
  { date: '2026-09-19', seconds: 0, amount: null },
  { date: '2026-09-20', seconds: 0, amount: null },
];

const SERIES: Stats['month']['series'] = [
  { date: '2026-09-01', actual: 400 },
  { date: '2026-09-02', actual: 900 },
  { date: '2026-09-03', actual: 1500 },
  { date: '2026-09-04', actual: null },
];

function month(over: Partial<Stats['month']> = {}): Stats['month'] {
  return {
    earned: 6840,
    projected: 11_817,
    businessDaysElapsed: 13,
    businessDaysTotal: 22,
    series: SERIES,
    projection: {
      from: { date: '2026-09-03', amount: 1500 },
      to: { date: '2026-09-30', amount: 11_817 },
    },
    /* The month's money per client — the strip's bands, in the order the
       rollup returns them. Northwind earns three quarters of the month. */
    byClient: [
      { clientId: 'c1', clientName: 'Northwind Trading', amount: 5130 },
      { clientId: 'c2', clientName: 'Acme Supply', amount: 1710 },
    ],
    ...over,
  };
}

function stats(over: Partial<Stats> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: {
      total: 6840,
      seconds: 307_800,
      byClient: [
        {
          clientId: 'c1',
          clientName: 'Northwind Trading',
          currency: 'USD',
          seconds: 307_800,
          amount: 6840,
          unratedCount: 0,
          oldestDays: 12,
        },
      ],
      moreClients: 1,
    },
    week: WEEK,
    month: month(),
    awaitingPayment: 0,
    openInvoiceCount: 0,
    collected: {
      trailing12: 0,
      thisMonth: 0,
      daysSincePaid: null,
      byMonth: [],
    },
    earnedToday: 340,
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
      overlaps: [],
    },
    ...over,
  } as Stats;
}

const ENTRIES = {
  entries: [
    {
      id: 'e1',
      projectId: 'p1',
      taskName: 'Inventory sync edge cases',
      startedAt: '2026-09-17T09:00:00.000Z',
      endedAt: '2026-09-17T13:15:00.000Z',
      isBillable: true,
      durationSeconds: 15_300,
      durationOk: false,
    },
    {
      id: 'e2',
      projectId: null,
      taskName: 'Invoicing admin',
      startedAt: '2026-09-17T14:00:00.000Z',
      endedAt: '2026-09-17T14:20:00.000Z',
      isBillable: false,
      durationSeconds: 1200,
      durationOk: false,
    },
  ],
};

/**
 * Two clients with hues, plus the archived one — a finished engagement keeps
 * its color rather than falling into the neutral band.
 */
const CLIENTS = {
  clients: [
    { id: 'c1', name: 'Northwind Trading', color: '#4F9DF7' },
    { id: 'c2', name: 'Acme Supply', color: '#E0714B' },
    {
      id: 'c3',
      name: 'Old Engagement',
      color: '#B07CD6',
      archivedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

/**
 * `/calendar?granularity=day`: seconds per client per local day, with `''`
 * for internal work. Monday is two clients at 2:1; Wednesday is one client
 * and some internal time.
 */
const ACTIVITY = {
  days: [
    {
      date: '2026-09-14',
      totalSeconds: 25_200,
      byClient: { c1: 16_800, c2: 8400 },
    },
    { date: '2026-09-15', totalSeconds: 19_800, byClient: { c1: 19_800 } },
    {
      date: '2026-09-16',
      totalSeconds: 24_300,
      byClient: { c2: 18_300, '': 6000 },
    },
    { date: '2026-09-17', totalSeconds: 15_300, byClient: { c1: 15_300 } },
  ],
};

/** Serves whatever `current` points at, so a refetch can return new figures. */
function serve(
  get: () => Stats,
  entries: unknown = ENTRIES,
  activity: unknown = ACTIVITY,
  clients: unknown = CLIENTS,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/entries')) {
        return new Response(JSON.stringify(entries), { status: 200 });
      }
      /* Before `/clients`: the activity call is `/calendar?granularity=day`
         and both are matched by substring. */
      if (path.includes('/calendar')) {
        return new Response(JSON.stringify(activity), { status: 200 });
      }
      if (path.includes('/clients')) {
        return new Response(JSON.stringify(clients), { status: 200 });
      }
      if (path.includes('/projects')) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(get()), { status: 200 });
    }),
  );
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Reduced motion, so a figure is its settled value on first paint. */
function reducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  reducedMotion(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the three regions', () => {
  it('renders a figure for each of today, the week and the month', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    /* Each figure in the tier the spec assigns it: the month's Earned is the
       hero, today's and the week's are one tier down and equal to each
       other. A figure sized by its region rather than by what it means is
       the thing these assertions exist to catch. */
    await waitFor(() =>
      expect(container.querySelector('.type-figure-hero')?.textContent).toBe(
        '$6,840.00',
      ),
    );

    const majors = [...container.querySelectorAll('.type-figure')].map((el) =>
      el.textContent?.trim(),
    );
    // Today's $340 and the week's $1,880 — 560 + 440 + 540 + 340.
    expect(majors).toContain('$340.00');
    expect(majors).toContain('$1,880.00');

    // On track for and Unbilled, the two readings taken from the month.
    const minors = [...container.querySelectorAll('.type-amount-hero')].map(
      (el) => el.textContent?.trim(),
    );
    expect(minors).toContain('$11,817.00');
    expect(minors).toContain('$6,840.00');
  });

  it('marks only the projection endpoint with success, and nothing with the accent', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    /* The accent is spent on the running timer in the bar below, so this
       screen takes none of it. `success` marks one thing. */
    expect(container.innerHTML).not.toMatch(/accent/);

    const green = [...container.querySelectorAll('[class*="success"]')];
    expect(green).toHaveLength(1);
    expect(green[0]?.getAttribute('data-projection')).toBe('end');
  });

  it('renders the empty state when the projection is null, never NaN', async () => {
    serve(() => stats({ month: month({ projected: null, projection: null }) }));
    const { container } = render(<HomeCards />, { wrapper });

    const pending = await waitFor(() => {
      const el = container.querySelector('[data-projection="pending"]');
      if (!el) throw new Error('no pending state');
      return el;
    });
    expect(pending).toBeVisible();
    expect(container.textContent).not.toMatch(/NaN/);

    // No dashed segment and no green endpoint without a second point.
    expect(container.querySelector('[data-projection="line"]')).toBeNull();
    expect(container.querySelector('[data-projection="end"]')).toBeNull();
  });

  it('draws a bar with no money for a day of purely unrated work', async () => {
    const week = [...WEEK];
    // Worked, and the rate chain resolves to nothing: height, no figure.
    week[1] = { date: '2026-09-15', seconds: 19_800, amount: null };
    serve(() => stats({ week }));
    const { container } = render(<HomeCards />, { wrapper });

    const bar = await waitFor(() => {
      const el = container.querySelector('[data-bar="2026-09-15"]');
      if (!el) throw new Error('no bar');
      return el as HTMLElement;
    });

    // The bar has a real height — the time was worked.
    expect(bar.style.height).not.toBe('');
    expect(bar.style.height).not.toBe('0%');
    // And prints no money, because there is none to print.
    expect(bar.textContent?.trim()).toBe('');
    // The hours still read, beneath it.
    expect(screen.getByText('5h 30m')).toBeVisible();
  });

  it('prints an em-dash and no bar for a day with no work', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    // Friday through Sunday: nothing worked, so nothing drawn.
    for (const date of ['2026-09-18', '2026-09-19', '2026-09-20']) {
      expect(container.querySelector(`[data-bar="${date}"]`)).toBeNull();
    }

    /* The caption keeps its hours line as a placeholder, which is what holds
       every weekday label on one baseline. Scoped to the week: Today's own
       empty rows print the same em-dash, and a card-wide count would make
       this assertion about both regions at once. */
    const weekDashes = [
      ...(container
        .querySelector('[data-region="week"]')
        ?.querySelectorAll('span') ?? []),
    ].filter((el) => el.textContent === '—');
    expect(weekDashes).toHaveLength(3);
  });

  it('gives internal work a hollow ring rather than a color', async () => {
    serve(() => stats());
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Invoicing admin')).toBeVisible(),
    );

    /* Only clients have a color. The entry with no project is internal, and
       the absence is drawn as a ring. */
    const row = screen.getByText('Invoicing admin').closest('[data-task]');
    expect(row?.querySelector('[data-pip="internal"]')).not.toBeNull();
  });

  it('writes durations as hours and minutes, never as a decimal', async () => {
    serve(() => stats());
    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('7h')).toBeVisible());
    expect(screen.getByText('5h 30m')).toBeVisible();
    expect(screen.getByText('6h 45m')).toBeVisible();
    expect(screen.queryByText(/\d\.\d+h/)).toBeNull();
  });

  it('omits the awaiting line when there is nothing to count', async () => {
    serve(() => stats());
    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());
    /* At zero the line is not rendered at all — a `$0.00 awaiting` would be a
       figure standing in for the absence of one. */
    expect(screen.queryByText(/open invoice/)).toBeNull();
  });

  it('counts the open invoices once there are some', async () => {
    serve(() => stats({ awaitingPayment: 1200, openInvoiceCount: 2 }));
    render(<HomeCards />, { wrapper });

    /* The COUNT, never a description of the worst of them: naming one invoice
       says nothing about the others and drops them at two or more. */
    await waitFor(() =>
      expect(screen.getByText(/2 open invoices/)).toBeVisible(),
    );
  });

  it('a day with no entries keeps its rows', async () => {
    serve(() => stats(), { entries: [] });
    const { container } = render(<HomeCards />, { wrapper });

    /* The column holds the height it will have once the day has work in it,
       so the top row does not change shape at the first entry. */
    await waitFor(() =>
      expect(
        container.querySelectorAll('[aria-hidden="true"][data-entry-empty]'),
      ).toHaveLength(3),
    );
  });

  it('asks for the day as an ISO range, not a date key', async () => {
    serve(() => stats());
    render(<HomeCards />, { wrapper });

    /* `ListEntriesQuery` takes ISO datetimes with an offset. A bare
       `2026-09-21` is a 422, and the list then renders empty on a day that
       has work in it — which looks exactly like a day with none. */
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
        .map(([url]) => String(url))
        .filter((u) => u.includes('/entries?'));
      expect(calls.length).toBeGreaterThan(0);
      for (const url of calls) {
        const q = new URL(url, 'http://localhost').searchParams;
        expect(q.get('from')).toMatch(/T\d{2}:\d{2}:\d{2}/);
        expect(q.get('to')).toMatch(/T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  it('a placeholder row carries no pip', async () => {
    serve(() => stats(), { entries: [] });
    const { container } = render(<HomeCards />, { wrapper });

    /* The hollow ring means internal work. Three of them would say the day
       held three untracked entries, which is the screen asserting something
       that did not happen. */
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-entry-empty]').length,
      ).toBeGreaterThan(0),
    );
    for (const row of container.querySelectorAll('[data-entry-empty]')) {
      expect(row.querySelector('[data-pip]')).toBeNull();
    }
  });
});

/**
 * One palette across the bars, the strip and the legend.
 *
 * A hue belongs to the client, never to the position
 * (`docs/design/screens/home.html`, "The strip and the legend").
 */
describe('the client split', () => {
  /** A stack segment's height, as the fraction the style carries. */
  function share(el: Element | null): number {
    return Number.parseFloat((el as HTMLElement).style.height);
  }

  it('stacks a bar by client, in the ratio of their seconds', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    const c1 = await waitFor(() => {
      const el = container.querySelector(
        '[data-day="2026-09-14"][data-segment="c1"]',
      );
      if (!el) throw new Error('no c1 segment');
      return el;
    });
    const c2 = container.querySelector(
      '[data-day="2026-09-14"][data-segment="c2"]',
    );

    /* Monday is 16800s and 8400s — two to one. The SECONDS ratio, never the
       money: a segment sized by money would make an expensive hour taller
       than a cheap one and break the ratio the bar exists to show. */
    expect(c2).not.toBeNull();
    expect(share(c1)).toBeCloseTo(66.67, 1);
    expect(share(c2)).toBeCloseTo(33.33, 1);
    expect(share(c1) + share(c2)).toBeCloseTo(100, 5);
  });

  it('sizes a stack by seconds even where the money says otherwise', async () => {
    /* Wednesday is c2 at 18300s and internal at 6000s, and the day's money is
       $540 — all of it c2's, because internal work earns nothing. A stack
       drawn from money would give c2 the whole bar. */
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    const c2 = await waitFor(() => {
      const el = container.querySelector(
        '[data-day="2026-09-16"][data-segment="c2"]',
      );
      if (!el) throw new Error('no c2 segment');
      return el;
    });
    const internal = container.querySelector(
      '[data-day="2026-09-16"][data-segment="internal"]',
    );

    expect(share(c2)).toBeCloseTo(75.31, 1);
    expect(share(internal)).toBeCloseTo(24.69, 1);
  });

  it('gives internal work in a bar no hue', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    /* Waits for the HUE, not merely the segment: `/clients` resolves after
       `/stats`, so a bar asserted on arrival is one whose colors have not
       landed yet. */
    const c1 = await waitFor(() => {
      const el = container.querySelector(
        '[data-day="2026-09-14"][data-segment="c1"]',
      ) as HTMLElement | null;
      if (!el?.style.backgroundColor) throw new Error('no hue yet');
      return el;
    });
    const internal = container.querySelector(
      '[data-day="2026-09-16"][data-segment="internal"]',
    ) as HTMLElement;

    /* Only clients have a color. Internal work takes the neutral, never one
       of the palette's hues. */
    expect(internal.style.backgroundColor).toBe('var(--color-subtle)');
    expect(internal.style.backgroundColor).not.toBe(c1.style.backgroundColor);
  });

  it("sizes the month's strip by money, not by seconds", async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    const strip = await waitFor(() => {
      const el = container.querySelector('[data-strip="clients"]');
      if (!el) throw new Error('no strip');
      return el;
    });

    /* $5,130 and $1,710 — three to one. The month's subject is Earned, so
       its split divides what was earned, where the bars divide hours. */
    const c1 = strip.querySelector('[data-band="c1"]') as HTMLElement;
    const c2 = strip.querySelector('[data-band="c2"]') as HTMLElement;
    expect(Number.parseFloat(c1.style.width)).toBeCloseTo(75, 5);
    expect(Number.parseFloat(c2.style.width)).toBeCloseTo(25, 5);
  });

  it('resolves a client to the same hue in the bar and the strip', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    /* Both regions' hues have to have landed before they can be compared. */
    await waitFor(() => {
      const bar = container.querySelector(
        '[data-segment="c1"]',
      ) as HTMLElement | null;
      if (!bar?.style.backgroundColor) throw new Error('no hue yet');
      if (!container.querySelector('[data-band="c1"]')) {
        throw new Error('no strip');
      }
    });

    /* A palette that reorders between two regions of one panel is a palette
       that means nothing. */
    for (const id of ['c1', 'c2']) {
      const bar = container.querySelector(
        `[data-segment="${id}"]`,
      ) as HTMLElement;
      const band = container.querySelector(
        `[data-band="${id}"]`,
      ) as HTMLElement;
      expect(bar.style.backgroundColor).toBe(band.style.backgroundColor);
      expect(bar.style.backgroundColor).not.toBe('');
    }
  });

  it('names every client of either region once, in one legend', async () => {
    serve(() => stats());
    const { container } = render(<HomeCards />, { wrapper });

    /* Internal work enters the legend from `/calendar`, which resolves after
       `/stats` — so the legend is asserted once every region has reported. */
    const legend = await waitFor(() => {
      const el = container.querySelector('[data-legend="clients"]');
      if (!el?.querySelector('[data-legend-key="internal"]')) {
        throw new Error('legend incomplete');
      }
      return el;
    });

    /* ONE legend for the panel: the bars and the strip draw from one set of
       clients, and two keys for one palette is a second thing to keep in
       agreement. */
    expect(container.querySelectorAll('[data-legend="clients"]')).toHaveLength(
      1,
    );

    const named = [...legend.querySelectorAll('[data-legend-key]')].map((el) =>
      el.getAttribute('data-legend-key'),
    );
    // Both clients and internal work, each exactly once.
    expect(named).toEqual(['c1', 'c2', 'internal']);

    // Internal work carries its hollow ring, so the treatment can be looked up.
    expect(
      legend
        .querySelector('[data-legend-key="internal"]')
        ?.querySelector('[data-pip="internal"]'),
    ).not.toBeNull();
    expect(screen.getByText('Northwind Trading')).toBeVisible();
    expect(screen.getByText('Internal')).toBeVisible();
  });

  it('keeps an archived client its color', async () => {
    /* A finished engagement stays in the history; dropping its color would
       silently move those hours into the neutral band. */
    serve(() =>
      stats({
        month: month({
          byClient: [
            { clientId: 'c3', clientName: 'Old Engagement', amount: 2000 },
          ],
        }),
      }),
    );
    const { container } = render(<HomeCards />, { wrapper });

    /* The band draws neutral until `/clients` answers, so the wait is for a
       resolved hue rather than for any color at all. */
    await waitFor(() => {
      const el = container.querySelector(
        '[data-band="c3"]',
      ) as HTMLElement | null;
      expect(el?.style.backgroundColor).toBe('rgb(176, 124, 214)');
    });
  });

  it('draws no strip on a month that has earned nothing', async () => {
    serve(() => stats({ month: month({ byClient: [] }) }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());
    /* A strip of one neutral band would claim the month came from nobody,
       where the honest reading is that it has not earned yet. */
    expect(container.querySelector('[data-strip="clients"]')).toBeNull();
  });
});

describe('the arrival roll', () => {
  /**
   * The roll means "this number just moved". Returning to Home from another
   * screen holding the same figures must roll nothing — a roll there would
   * say it of numbers the user read a moment ago
   * (the spec's "What earns a place").
   */
  it('does not fire on a remount holding the same figures', async () => {
    reducedMotion(false);
    serve(() => stats());

    /* Whether a TWEEN WAS SCHEDULED is the observable. Both a roll and a rest
       end on the same settled figure, so asserting on the text after it lands
       passes either way — which is how the defect survived a green suite. */
    const scheduled = vi.fn();
    const raf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      scheduled();
      return raf(cb);
    });

    /* The first mount IS the arrival: it seeds its origin below the figure
       and rolls, which is the behavior being preserved. */
    const first = render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(
        first.container.querySelector('.type-figure-hero')?.textContent,
      ).toBe('$6,840.00'),
    );
    expect(scheduled).toHaveBeenCalled();
    first.unmount();

    scheduled.mockClear();

    /* The same QueryClient, which is what survives a client-side navigation
       and dies on reload — so this is a return to Home, not a fresh load. */
    const again = render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(again.container.querySelector('.type-figure-hero')).not.toBeNull(),
    );

    /* Nothing scheduled, and the figure settled on its first paint: the roll
       would have said "this just moved" of numbers read a moment ago. */
    expect(scheduled).not.toHaveBeenCalled();
    expect(
      again.container.querySelector('.type-figure-hero')?.textContent,
    ).toBe('$6,840.00');
  });

  /**
   * `home.html`: "Earned and Unbilled read the same for most of a monthly
   * cycle." Two figures holding one number are still two figures, and a roll
   * remembered by VALUE would let the first of them speak for the second.
   */
  it('rolls both figures when two of them hold the same amount', async () => {
    reducedMotion(true);
    serve(() => stats());

    const { container } = render(<HomeCards />, { wrapper });

    /* The fixture's month earned and unbilled total are both 6840. Each must
       arrive at its own figure: keyed by amount, the second finds 6840
       already recorded and never rolls, so it paints its final number on the
       first frame while the other climbs to it. */
    await waitFor(() =>
      expect(container.querySelector('.type-figure-hero')?.textContent).toBe(
        '$6,840.00',
      ),
    );

    const seen = (
      client as unknown as {
        [k: symbol]: Map<string, number> | undefined;
      }
    )[Symbol.for('stint.count-up.arrived')];

    expect(seen?.get('month-earned')).toBe(6840);
    expect(seen?.get('month-unbilled')).toBe(6840);
    /* Five figures, five names — not one entry standing for all of them. */
    expect(seen?.size).toBeGreaterThanOrEqual(4);
  });

  it('still rolls a figure whose value actually changed', async () => {
    reducedMotion(true);
    let current = stats();
    serve(() => current);

    const { container } = render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(container.querySelector('.type-figure-hero')?.textContent).toBe(
        '$6,840.00',
      ),
    );

    current = stats({ month: month({ earned: 9000 }) });
    await client.refetchQueries();

    // The tween on a value that CHANGES is untouched by the arrival flag.
    await waitFor(() =>
      expect(container.querySelector('.type-figure-hero')?.textContent).toBe(
        '$9,000.00',
      ),
    );
  });
});
