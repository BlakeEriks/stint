import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HomeCards } from '@/components/home-cards';
import { BEAT_MS } from '@/lib/client/use-beat';
import type { Stats } from '@/lib/client/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/**
 * Thursday 17 September 2026, at LOCAL noon.
 *
 * Local rather than a UTC instant: `localDateKey` and the heatmap read the
 * browser's own zone, so a fixed instant would land on the previous or next
 * calendar day for a runner far enough east or west. Noon is far enough from
 * either midnight that no zone shifts the date.
 */
const NOW = new Date(2026, 8, 17, 12, 0, 0);

function stats(over: Partial<Stats> = {}): Stats {
  return {
    currency: 'USD',
    unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
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
    byProject: {
      seconds: 0,
      amount: 0,
      byProject: [],
      moreProjects: 0,
      tailSeconds: 0,
      tailAmount: 0,
    },
    pace: null,
    billableRatio: null,
    awaitingPayment: 0,
    openInvoiceCount: 0,
    collected: {
      trailing12: 0,
      thisMonth: 0,
      daysSincePaid: null,
      byMonth: [],
    },
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
    },
    ...over,
  };
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

/**
 * Four projects whose hours and revenue rank differently, so a test that
 * switches the unit can tell a re-sort from a redraw: Retainer is last by
 * hours and first by money.
 *
 * The tail carries three further projects plus whatever was filed under none,
 * so `columns + tail === total` — the reconciliation the footer prints.
 */
const fourProjects = {
  seconds: 360000 + 36000,
  amount: 9000.01 + 900,
  byProject: [
    {
      projectId: 'p1',
      projectName: 'Platform rebuild',
      clientId: 'c1',
      clientName: 'Northwind',
      currency: 'USD',
      seconds: 180000,
      billableSeconds: 180000,
      amount: 1000,
      unratedCount: 0,
    },
    {
      projectId: 'p2',
      projectName: 'Brand system',
      clientId: 'c1',
      clientName: 'Northwind',
      currency: 'USD',
      seconds: 90000,
      billableSeconds: 90000,
      amount: 2000,
      unratedCount: 0,
    },
    {
      projectId: 'p3',
      projectName: 'Checkout API',
      clientId: null,
      clientName: null,
      currency: 'USD',
      seconds: 54000,
      billableSeconds: 54000,
      amount: 3000,
      unratedCount: 0,
    },
    {
      projectId: 'p4',
      projectName: 'Retainer',
      clientId: 'c1',
      clientName: 'Northwind',
      currency: 'USD',
      seconds: 36000,
      billableSeconds: 36000,
      amount: 3000.01,
      unratedCount: 0,
    },
  ],
  moreProjects: 3,
  tailSeconds: 36000,
  tailAmount: 900,
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

/** The same wrapper, over a client the test can then inspect. */
function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/* A pinned clock and an empty store, for the same reason: both the heatmap's
   dates and `stint.day` are read off state that outlives one test. The store
   is cleared here rather than in the one describe that writes it — a leaked
   day made every later test's since-line depend on test order. */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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
    expect(headings.some((h) => h?.startsWith('Collected'))).toBe(true);
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
    /* A named figure now rather than a sentence — read off its label, so
       the assertion still names which money it is. */
    const awaiting = await screen.findByText('Awaiting');
    const column = awaiting.parentElement?.parentElement;
    await waitFor(() =>
      expect(column?.querySelector('.type-amount-hero')?.textContent).toContain(
        '$900.00',
      ),
    );

    await waitFor(
      () => expect(screen.getAllByText('$3,000.00').length).toBeGreaterThan(0),
      { timeout: 4000 },
    );
    /* The sum must never appear — not settled, not for a frame of the
       arrival either. */
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
          perMonth: 3000,
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

    /* Every attribute, not just `style` and `class`: the plot paints through
       SVG's `stroke` and `fill`, so a scan of inline styles alone passed
       against an accent-stroked line. The success colour belongs to the paid
       beat and appears nowhere in this set either. */
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

describe('the month plot', () => {
  const paceAt = (actual: number, expected: number) => ({
    unit: 'hours' as const,
    target: 120,
    actual,
    expected,
    delta: actual - expected,
    businessDaysElapsed: 13,
    businessDaysTotal: 22,
    series: series(22),
  });

  /* The gap says which way the month is running, so the shape and the figure
     below it agree rather than making the reader check both. */
  it('fills the gap with warning when behind and info when ahead', async () => {
    serve(stats({ unbilled: oneClient, pace: paceAt(40, 70) }));
    const { unmount } = render(<HomeCards />, { wrapper });

    const behind = await screen.findByRole('img', { name: /of 120/ });
    expect(behind.querySelector('path')?.getAttribute('fill')).toBe(
      'var(--color-warning)',
    );
    unmount();

    serve(stats({ unbilled: oneClient, pace: paceAt(90, 70) }));
    render(<HomeCards />, { wrapper });

    const ahead = await screen.findByRole('img', { name: /of 120/ });
    expect(ahead.querySelector('path')?.getAttribute('fill')).toBe(
      'var(--color-info)',
    );
  });

  /* Cyan is reserved for an outcome. A month ahead on the 13th can be behind
     on the 14th, which is a state rather than a result. */
  it('never spends success cyan on being ahead', async () => {
    serve(stats({ unbilled: oneClient, pace: paceAt(90, 70) }));
    const { container } = render(<HomeCards />, { wrapper });

    await screen.findByRole('img', { name: /of 120/ });
    expect(container.innerHTML).not.toContain('--color-success');
  });

  /* The region's subject is the line, not a total: the fraction is context
     and sits with the controls. */
  it('carries the fraction beside the title, not as a figure', async () => {
    serve(stats({ unbilled: oneClient, pace: paceAt(40, 70) }));
    const { container } = render(<HomeCards />, { wrapper });

    await screen.findByRole('img', { name: /of 120/ });
    expect(container.querySelector('.type-figure')?.textContent).not.toMatch(
      /120/,
    );
    expect(container.textContent).toContain('40.0h / 120.0h');
  });
});

describe('By client', () => {
  /* Colour belongs to the client, and one client is one colour across the
     screen: the pip here, the Velocity key and the heatmap all resolve from
     the same source, so a row cannot disagree with the chart beside it. */
  it('marks each client with its colour, and internal work with neither', async () => {
    serve(
      stats({
        unbilled: {
          ...oneClient,
          byClient: [
            ...oneClient.byClient,
            /* No client: internal work, which takes the neutral rather than
               borrowing a hue that belongs to someone who is paying. */
            {
              clientId: null,
              clientName: 'No client',
              currency: 'USD',
              seconds: 1800,
              amount: 0,
              unratedCount: 0,
              oldestDays: 1,
            },
          ],
        },
      }),
    );
    render(<HomeCards />, { wrapper });

    const heading = await screen.findByRole('heading', { name: /by client/i });
    const rows = [...(heading.parentElement?.querySelectorAll('li') ?? [])];
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.querySelector('span[aria-hidden]')).not.toBeNull();
    }
  });
});

describe('the panel resolves its colours once', () => {
  /* By-client, Velocity and the heatmap all paint client hues, and each used
     to run the clients query itself. React Query dedupes the FETCH, so a
     request count cannot see the difference — the cost is three observers on
     one key, and three call sites that can drift apart on whether archived
     clients are asked for. Counting observers is what fails when they come
     back: with the three inline queries restored this reads 3. */
  it('subscribes to the clients query exactly once', async () => {
    const velocity = {
      months: 3,
      total: 9000,
      perMonth: 3000,
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

    serve(
      stats({ unbilled: oneClient, velocity }),
      [{ date: '2026-09-16', totalSeconds: 7200, byClient: { c1: 7200 } }],
      [{ id: 'c1', name: 'Northwind', color: 'rgb(10, 20, 30)' }],
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(<HomeCards />, { wrapper: wrapperFor(client) });

    // Every colour-painting region on screen, so each would have subscribed
    // had it kept its own query.
    await waitFor(() => {
      expect(screen.getByText('Velocity')).toBeInTheDocument();
      expect(screen.getByText('Last 6 months')).toBeInTheDocument();
      expect(screen.getByText('By project')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /by client/i }),
      ).toBeInTheDocument();
    });

    const cached = client
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey[0] === 'clients');

    expect(cached).toHaveLength(1);
    expect(cached[0]?.observers.length).toBe(1);
  });
});

describe('the panel header', () => {
  /* The date answers "is this figure current?" — the question a dashboard
     that mostly does not change invites. */
  it('names the day on the left and the date on the right', async () => {
    serve(stats({ unbilled: oneClient }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* Literals, under the pinned clock: re-deriving these through the same
       `Intl` call the component uses asserts only that the call is
       deterministic, and passes against any date it happens to render. */
    const day = 'Thursday';
    const date = 'Sep 17';

    const heading = screen.getByRole('heading', { name: day });
    const head = heading.closest('div')?.parentElement;
    expect(head).not.toBeNull();
    expect(head?.textContent).toContain(date);
  });

  /* Today's earnings are reported beside the figure they moved, so the head
     is the day and the date and nothing else. */
  it('carries no figure of its own', async () => {
    serve(stats({ unbilled: oneClient, earnedToday: 112.5 }));
    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    const heading = screen.getByRole('heading', { name: 'Thursday' });
    const head = heading.parentElement;
    expect(head?.textContent).not.toMatch(/\$/);
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
    /* `bg-` and `shadow-` only: those two are what actually draws a card
       inside a card. A border or a radius on a section does not, and
       asserting them made the test fire on any restyling that happened to
       reach for one. */
    for (const s of sections) {
      const classes = [...s.classList];
      expect(classes.filter((c) => c.startsWith('bg-'))).toEqual([]);
      expect(classes.filter((c) => c.startsWith('shadow-'))).toEqual([]);
    }
  });
});

describe('Velocity', () => {
  const velocity = {
    months: 3,
    total: 9000,
    perMonth: 3000,
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

  it('never says "earned", and the unit says the figure is gross', async () => {
    serve(stats({ velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await screen.findByRole('heading', { name: /velocity/i });

    /* "Earned" claims money collected. This window is work DONE, part of it
       not yet invoiced and none of it necessarily paid — the same
       overstatement the Unbilled region refuses. The qualifier lives on the
       unit instead, where it travels with the figure. */
    expect(container.textContent).not.toMatch(/earned/i);
    expect(container.textContent).toContain('/mo gross');
  });

  it('prints the per-month gross, never the invoiced/unbilled split', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('$3,000.00')).toBeVisible());

    /* The split's figures are window totals against a per-month headline, so
       they cannot reconcile with it; the unbilled half also restates the
       Unbilled region. */
    expect(screen.queryByText(/invoiced/)).toBeNull();
    expect(screen.queryByText(/unbilled$/)).toBeNull();
    expect(screen.queryByText('$6,000.00')).toBeNull();

    /* The window's hours are By project's footer now, not a line under this
       bar: one window, one place that totals it. */
    const region = screen
      .getByRole('heading', { name: /velocity/i })
      .closest('section');
    expect(region?.textContent).not.toContain('100h');
  });

  it('reports the figure per month, so two windows are comparable', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('/mo gross')).toBeInTheDocument(),
    );
    /* $9,000 over three months. The window total carries no rate, so two
       users on different windows cannot compare it. */
    /* Awaited: a figure arrives from just short of its value, so reading it
       on the first paint catches the tween rather than the answer. */
    /* Velocity's OWN figure: Collected leads the panel with one too, so a
       bare `.type-figure` reads whichever comes first in the document. */
    const velocityHead = screen.getByText('Velocity').closest('header');
    await waitFor(
      () =>
        expect(
          velocityHead?.querySelector('.type-figure')?.textContent,
        ).toContain('$3,000.00'),
      { timeout: 4000 },
    );
  });

  /* THE point of the region's shape. Unbilled is a figure over per-client
     rows; a second region built the same way — same columns, same trailing
     arrow, and with a full book the same order of magnitude — is read as the
     first one printed twice. This goes red if it is rebuilt as a row list. */
  it('draws its mix as a bar and an inline key, never as rows', async () => {
    serve(stats({ unbilled: oneClient, velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('/mo gross')).toBeInTheDocument(),
    );

    const heading = screen.getByRole('heading', { name: /velocity/i });
    const region = heading.closest('section');
    expect(region).not.toBeNull();

    // The bar IS the picture: one segment per client, and it must exist.
    const bar = region?.querySelector('[role="img"]');
    expect(bar?.getAttribute('aria-label')).toContain('Northwind');
    expect(bar?.children.length).toBe(velocity.byClient.length);

    /* A row list is what it must not be: no <ul>, and none of the trailing
       arrows every Row renders. Unbilled's rows still exist elsewhere in the
       panel, so this is scoped to the region. */
    expect(region?.querySelector('ul')).toBeNull();
    expect(region?.querySelector('svg.lucide-arrow-right')).toBeNull();
    expect(container.querySelectorAll('ul').length).toBeGreaterThan(0);
  });

  /* The hues at full strength across the panel's width pull harder than the
     running timer, which is the one thing on screen allowed to shout. */
  it('mutes the mix so it never out-shouts the running timer', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('/mo gross')).toBeInTheDocument(),
    );

    const heading = screen.getByRole('heading', { name: /velocity/i });
    const segments = [
      ...(heading
        .closest('section')
        ?.querySelectorAll<HTMLElement>('[role="img"] > div') ?? []),
    ];
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      const opacity = Number(seg.style.opacity);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    }
  });
});

describe('the panel pairs its regions', () => {
  const velocity = {
    months: 3,
    total: 9000,
    perMonth: 3000,
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

  /* jsdom applies NEITHER media nor container queries, so asserting that two
     regions are side by side proves nothing — it would pass against either
     mechanism, and against neither. The class IS the mechanism, so that is
     what is asserted. */
  it('sizes the columns by the CONTAINER, never the viewport', async () => {
    serve(stats({ unbilled: oneClient, velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* The panel is not the window: the rail and the dock claim their space at
       `lg` and `xl`, so it is WIDER at a 1100px window than at 1440. A
       viewport breakpoint would collapse the wide one and split the narrow. */
    const panel = container.firstElementChild;
    expect([...(panel?.classList ?? [])]).toContain('@container');

    const pairs = [...container.querySelectorAll('div.grid')].filter((d) =>
      [...d.classList].some((c) => c.includes('grid-cols-')),
    );
    expect(pairs.length).toBe(3);

    for (const pair of pairs) {
      const classes = [...pair.classList];
      // Every column class is container-scoped (`@2xl:`), never bare `md:`.
      const cols = classes.filter((c) => c.includes('grid-cols-'));
      expect(cols.length).toBeGreaterThan(0);
      for (const c of cols) expect(c).toMatch(/^@[a-z0-9]+:/);
      expect(classes.filter((c) => /^(sm|md|lg|xl|2xl):/.test(c))).toEqual([]);
    }
  });

  it('pairs Collected with Owed, the month with Velocity, and By project with the half-year', async () => {
    serve(stats({ unbilled: oneClient, velocity, byProject: fourProjects }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeInTheDocument(),
    );

    /* The pairing is the layout: money that arrived beside money that has
       not. Each half is its own region, which is what leaves room for the
       pairing at all. */
    const pairs = [...container.querySelectorAll('div.grid')].filter((d) =>
      [...d.classList].some((c) => c.includes('grid-cols-')),
    );
    const headings = pairs.map((p) =>
      [...p.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
    );
    /* The right half carries no region title: "Owed" named a grouping
       rather than a quantity, and its two figures already say what they
       are. Each takes its own label at region weight instead. */
    expect(headings[0]?.[0]).toMatch(/^Collected/);
    expect(screen.getByText('Awaiting')).toBeVisible();
    expect(screen.getByText('Unbilled', { exact: true })).toBeVisible();
    expect(headings[1]?.[1]).toMatch(/velocity/i);
    expect(headings[2]).toEqual(['By project', 'Last 6 months']);
  });

  /* A vertical rule between the columns rebuilds the gridlines this whole
     feature removed. Every separator on this screen is horizontal and inset. */
  it('never draws a vertical divider between the columns', async () => {
    serve(stats({ unbilled: oneClient, velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled by client')).toBeInTheDocument(),
    );

    for (const el of container.querySelectorAll('*')) {
      const classes = [...el.classList];
      expect(
        classes.filter((c) => /^(@\S+:)?border-[lrxs]($|-)/.test(c)),
      ).toEqual([]);
      expect(classes.filter((c) => /^(@\S+:)?divide-x($|-)/.test(c))).toEqual(
        [],
      );
    }
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

  /* The window is half a year now, and nothing else on screen says how long
     it is: the heading is prose and the cells are the only count. Widening it
     back to 52 weeks halves the cell at this region's width, and without this
     test it does so silently. */
  it('draws half a year — 26 columns of 7 days, and no more', async () => {
    serve(stats({ unbilled: oneClient }), [dayAgo(1, { c1: 7200 })]);
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Last 6 months')).toBeInTheDocument(),
    );

    const grid = container.querySelector<HTMLElement>('div.grid-rows-7');
    expect(grid).not.toBeNull();
    expect(grid?.children.length).toBe(182);
    expect(grid?.style.gridTemplateColumns).toBe('repeat(26, minmax(0, 1fr))');
  });

  /* The cell count is also the fetch length, and the cache key has to carry
     it: a payload held from a 364-day range would be handed to a view that
     draws 182 cells, dropping half of it without a refetch. */
  it('keys its cache by the range it draws', async () => {
    serve(stats({ unbilled: oneClient }), [dayAgo(1, { c1: 7200 })]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(<HomeCards />, { wrapper: wrapperFor(client) });

    await waitFor(() =>
      expect(screen.getByText('Last 6 months')).toBeInTheDocument(),
    );

    const key = client
      .getQueryCache()
      .getAll()
      .find((q) => q.queryKey[0] === 'heatmap')?.queryKey;
    expect(key).toContain(182);
  });

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

/* ── the beat's narration ──────────────────────────────────────────── */

/**
 * Two events can land in one refetch, so the beat is classified on two axes.
 *
 * These serve a mutable figure and refetch, which the suite above has no need
 * for — it renders one payload and reads it.
 */
describe('the beat says only what it can tell', () => {
  let client: QueryClient;

  function unbilledAt(total: number, seconds = 3600) {
    return {
      total,
      seconds,
      byClient: [
        {
          clientId: 'c1',
          clientName: 'Northwind',
          currency: 'USD',
          seconds,
          amount: total,
          unratedCount: 0,
          oldestDays: 2,
        },
      ],
      moreClients: 0,
    };
  }

  function serveMoving(get: () => Stats) {
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
        return new Response(JSON.stringify(get()), { status: 200 });
      }),
    );
  }

  function movingWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  /** Every beat chip on screen, whichever region carried it. */
  function beats(container: HTMLElement) {
    return [...container.querySelectorAll('[data-beat]')].map((el) => ({
      kind: el.getAttribute('data-beat'),
      text: el.textContent ?? '',
    }));
  }

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  it('never nets an invoice against a stop into one figure', async () => {
    /* A $500 invoice is raised and a $200 stop lands in the same refetch.
       The net move in unbilled is −$300 — a figure nothing was invoiced for
       and nobody earned. Reporting it would invent money. */
    let current = stats({
      unbilled: unbilledAt(1000),
      awaitingPayment: 0,
    });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* Raised: $500 leaves unbilled for awaitingPayment. Stopped: $200 and an
       hour arrive. Unbilled nets to 700, which is −300. */
    current = stats({
      unbilled: unbilledAt(700, 7200),
      awaitingPayment: 500,
    });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    // The net is never spoken, whatever else the beat decides to say.
    expect(screen.queryByText(/\$300\.00/)).toBeNull();
    for (const b of beats(container)) {
      expect(b.text).not.toMatch(/\$300\.00/);
    }
  });

  it('never calls invoiced money unbillable work', async () => {
    /* A $200 invoice is raised and a $200 stop lands in the same refetch, so
       unbilled nets to exactly zero. That zero fell through to the seconds
       branch and labelled genuinely billable, genuinely invoiced money
       "unbillable" — the app misreporting money to the user. */
    let current = stats({
      unbilled: unbilledAt(1000),
      awaitingPayment: 0,
    });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    current = stats({
      unbilled: unbilledAt(1000, 7200),
      awaitingPayment: 200,
    });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/unbillable/)).toBeNull();
    for (const b of beats(container)) {
      expect(b.text).not.toMatch(/unbillable/);
    }
  });

  /* A stop and an offsetting rate edit land in one refetch: hours moved, so
     it is a stop, but the money nets to exactly zero. That zero is not
     evidence the work was unrated — it is evidence about the rate — and the
     old test `Math.abs(amount) > 0` read it as unbillable and said so beside
     rated work the user is about to invoice. The word is dropped rather than
     guessed; the hours are true either way. */
  it('will not call a stop unbillable when a rate edit offsets it', async () => {
    let current = stats({ unbilled: unbilledAt(1000, 3600) });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    /* An hour of rated work stops (+$150) while a rate cut elsewhere takes
       $150 off what was already there. Seconds move; the total does not. */
    current = stats({ unbilled: unbilledAt(1000, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    /* The chip is what this test is about, so wait for IT rather than for
       the region around it — the beat lands an effect later than the figure
       and a snapshot taken too early shows neither label and passes. */
    await waitFor(() => expect(beats(container).length).toBeGreaterThan(0));

    // An hour is reported; the word the app cannot justify is not.
    expect(beats(container).some((b) => b.kind === 'stop')).toBe(true);
    expect(screen.queryByText(/unbillable/)).toBeNull();
    for (const b of beats(container)) {
      expect(b.text).not.toMatch(/unbillable/);
      expect(b.text).toMatch(/1h/);
    }
  });

  it('reports a plain billable stop by moving the figure alone', async () => {
    /* Hours and money both arrive, so the beat is a stop — and the Unbilled
       figure travelling to its new value IS the report. A chip beside it
       saying the same amount would read as two events. */
    let current = stats({ unbilled: unbilledAt(100, 3600) });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled', { exact: true })).toBeInTheDocument(),
    );

    current = stats({ unbilled: unbilledAt(212.5, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    /* The figure lands on the server's number. */
    await waitFor(
      () => expect(screen.getAllByText('$212.50').length).toBeGreaterThan(0),
      { timeout: 4000 },
    );

    /* Nothing transient: the chip is reserved for what the figure cannot
       say — a stop that earned no money, and an invoice changing stage. */
    expect(beats(container).length).toBe(0);
  });

  it('does not fire a stop when a rate was corrected elsewhere', async () => {
    /* The seconds are untouched: nobody stopped a timer. A rate edit lifted
       what the same hours are worth, and a stop beat here narrates an event
       that did not happen. */
    let current = stats({ unbilled: unbilledAt(1000, 3600) });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    // Same hours, more money.
    current = stats({ unbilled: unbilledAt(1500, 3600) });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );
    expect(beats(container).some((b) => b.kind === 'stop')).toBe(false);
    expect(screen.queryByText(/\+\$500\.00/)).toBeNull();
  });

  /* The beat retires on a timer, and an unrelated refetch must not cancel
     that timer. React Query hands back a new object whenever ANY field
     changes — an age ticking over, a task renamed — so an effect keyed on
     the object re-runs, clears the pending timeout in its cleanup, then
     returns at the `no cause` guard without arming a replacement.

     The chip is then stranded beside the figure indefinitely, which is the
     failure `useBeat`'s own doc warns about: read as part of the figure. It
     also suppresses today's earnings, since `Earned` yields to a paid beat. */
  it('retires the beat even when an unrelated refetch lands first', async () => {
    let current = stats({ unbilled: unbilledAt(1000), awaitingPayment: 0 });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    // An invoice is raised: the paid beat appears and starts its timer.
    current = stats({ unbilled: unbilledAt(600), awaitingPayment: 400 });
    await act(async () => {
      await client.refetchQueries();
    });
    await waitFor(() => expect(beats(container).length).toBeGreaterThan(0));

    /* A refetch carrying NO classified event — neither axis moves. Some
       other field changed, which is all React Query needs to hand back a new
       object and re-run an effect keyed on one. */
    current = stats({
      unbilled: { ...unbilledAt(600), moreClients: 1 },
      awaitingPayment: 400,
    });
    await act(async () => {
      await client.refetchQueries();
    });

    /* Past the retirement beat, the chip must be gone. Advanced on the fake
       clock rather than slept through: 3.2s of real time against vitest's
       5s default left the test one slow render from a timeout, and
       `BEAT_MS` is imported so a change to it moves this with it. */
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS + 100);
    });
    expect(beats(container)).toEqual([]);
  });
});

/**
 * Money already asked for outlives the work it came from.
 *
 * The unbilled rollup's `having sum(seconds) > 0` empties `byClient` the
 * moment everything is invoiced — which is exactly when `awaitingPayment` is
 * the only figure on the screen. A region that hid on the empty list alone
 * took it down with it, and money the user is owed read as nothing at all.
 */
describe('awaiting payment survives a fully-invoiced book', () => {
  it('renders the link when every client has been invoiced', async () => {
    serve(
      stats({
        // Invoiced to the last hour: the rollup returns no rows at all.
        unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
        awaitingPayment: 4250,
      }),
    );

    render(<HomeCards />, { wrapper });

    /* The figure itself is the link now: it is the money, and the words
       that used to carry the href were a sentence beside it. */
    const link = await screen.findByRole('link', { name: /Awaiting/ });
    expect(link).toHaveAttribute('href', '/invoices?status=sent');
    await waitFor(() => expect(link.textContent).toContain('$4,250.00'));
  });

  /* The other half of the guard: with nothing unbilled AND nothing awaiting
     payment there is genuinely nothing to say, and an empty region is worse
     than none. `0` is a valid amount, so this is the boundary the coalesce
     has to get right rather than a truthiness test. */
  it('still hides when there is no money on either axis', async () => {
    serve(
      stats({
        unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
        awaitingPayment: 0,
      }),
    );

    render(<HomeCards />, { wrapper });
    /* The panel itself is what arrives — Velocity hides on an empty book
       too, so the day name is the anchor that says the fetch landed. */
    await waitFor(() =>
      expect(screen.getByText('Thursday')).toBeInTheDocument(),
    );

    expect(screen.queryByText('Unbilled')).toBeNull();
    expect(screen.queryByText('Awaiting')).toBeNull();
  });
});

/**
 * The headline and the split beneath it are one statement.
 *
 * `/mo` is the gross divided by the window, and it is printed directly above
 * the invoiced and unbilled figures that make it up. Divided at the render,
 * `Intl` rounded the quotient for display and `× months` no longer equalled
 * what was printed underneath — a billing screen contradicting itself by
 * cents. The division happens in `buildVelocity` now, so what is shown is
 * what was computed.
 */
describe('the velocity figures reconcile', () => {
  it('multiplies back to the split printed beneath it', async () => {
    /* 3 months of $1,000.01 — a total that does NOT divide evenly, which is
       the whole case: 3000.03 / 3 is 1000.01 exactly, while an unrounded
       quotient off a total like 3000.02 renders as a figure that does not
       multiply back. */
    const invoiced = 2000.02;
    const unbilled = 1000.01;
    serve(
      stats({
        unbilled: { ...oneClient },
        velocity: {
          months: 3,
          total: 3000.03,
          perMonth: 1000.01,
          invoiced,
          unbilled,
          seconds: 36000,
          byClient: [
            {
              clientId: 'c1',
              clientName: 'Northwind',
              currency: 'USD',
              seconds: 36000,
              invoiced,
              unbilled,
              unratedCount: 0,
            },
          ],
          moreClients: 0,
        },
      }),
    );

    render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('Velocity')).toBeInTheDocument(),
    );

    /* Read the headline off the screen and multiply it back, rather than
       asserting a string: the test is the reconciliation, not the format.
       Found via the `/mo gross` unit beside it, because the same amount also
       appears in the per-client legend below. */
    const unit = await screen.findByText('/mo gross');
    const read = () =>
      Number(
        (unit.previousElementSibling?.textContent ?? '').replace(
          /[^0-9.]/g,
          '',
        ),
      );

    /* Awaited: a figure arrives from just short of its value, so the
       reconciliation only holds once it has landed. */
    await waitFor(
      () =>
        expect(Math.round(read() * 3 * 100) / 100).toBe(
          Math.round((invoiced + unbilled) * 100) / 100,
        ),
      { timeout: 4000 },
    );
    expect(read()).toBeGreaterThan(0);
  });
});

describe('By project', () => {
  /** The panel, rendered with four projects and a tail behind them. */
  async function panel(over: Partial<Stats['byProject']> = {}) {
    serve(stats({ byProject: { ...fourProjects, ...over } }));
    const view = render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('By project')).toBeInTheDocument(),
    );
    return view;
  }

  /** The region's own section, so a second chart on the panel cannot match. */
  function region() {
    return screen.getByText('By project').closest('section');
  }

  /* The fill, not the track it sits in: both are divs inside the row and only
     the fill carries a width, so a bare `div` selector counts each bar twice. */
  function bars() {
    return [
      ...(region()?.querySelectorAll<HTMLElement>('[role="img"] div[style]') ??
        []),
    ].filter((el) => el.style.width !== '');
  }

  /* The toggle is the region's whole interaction, and both halves of it have
     to move: the figures change unit AND the bars change order, because
     the hours leader and the revenue leader are different projects. A toggle
     that reformats without re-ranking would look right on a book where the
     two agree, which is most of them. */
  it('switches the unit and re-ranks the bars with it', async () => {
    await panel();

    // By hours: Platform rebuild leads, Retainer is last.
    const byHours = [...(region()?.querySelectorAll('.truncate') ?? [])]
      .map((el) => el.textContent?.trim())
      .filter((t) => t === 'Platform rebuild' || t === 'Retainer');
    expect(byHours).toEqual(['Platform rebuild', 'Retainer']);
    expect(screen.getByText('50h')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));

    /* Retainer bills the most per hour, so revenue inverts the pair. The
       money appears and the hours go. */
    const byRevenue = [...(region()?.querySelectorAll('.truncate') ?? [])]
      .map((el) => el.textContent?.trim())
      .filter((t) => t === 'Platform rebuild' || t === 'Retainer');
    expect(byRevenue).toEqual(['Retainer', 'Platform rebuild']);
    expect(screen.getByText('$3,000.01')).toBeVisible();
    expect(region()?.textContent).not.toContain('50h');
  });

  /* The footer is where the window's real total lives — including the work
     the columns are not allowed to show. Both halves are conditional on
     there being a remainder, and a footer that prints "+0h 00m across 0 more"
     invents a category. */
  it('prints the tail only when there is one, in the unit on screen', async () => {
    const { unmount } = await panel();

    const footer = () =>
      [...(region()?.querySelectorAll('p') ?? [])]
        .map((p) => p.textContent ?? '')
        .find((t) => t.includes('logged')) ?? '';

    expect(footer()).toContain('+10h across 3 more');
    expect(footer()).toContain('110h logged');
    expect(footer()).toContain('3mo');

    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    expect(footer()).toContain('+$900.00 across 3 more');
    expect(footer()).toContain('$9,900.01 logged');

    unmount();

    await panel({ moreProjects: 0, tailSeconds: 0, tailAmount: 0 });
    expect(footer()).not.toContain('across');
    expect(footer()).toContain('logged');
  });

  /* The longest bar is always the full track, so the picture is "which is
     biggest and by how much". Widths as a share of the SUM instead would
     flatten four near-equal projects into four quarter-length stubs and make
     every book look the same. 50h against 25h is half, not a quarter. */
  it('scales the bars against the longest, never against their sum', async () => {
    await panel();

    expect(bars().map((b) => b.style.width)).toEqual([
      '100%',
      '50%',
      '30%',
      '20%',
    ]);
  });

  /* One project is a real book, not an edge case — most contractors start
     there. A region that renders nothing until it has four bars is a
     region that is blank for the users who most need to trust it. */
  it('renders one project as one full-length bar', async () => {
    await panel({
      byProject: [fourProjects.byProject[0]!],
      moreProjects: 0,
      tailSeconds: 0,
      tailAmount: 0,
      seconds: 180000,
      amount: 1000,
    });

    expect(bars().length).toBe(1);
    expect(bars()[0]?.style.width).toBe('100%');
  });

  /* Work filed under no project is in the total and never in the bars: a
     "No project" bar competes for one of four slots with something that is
     not a project, and the inbox already owns that subject. The API keeps it
     out of the array, so what this guards is a component that reads the tail
     back into the chart. */
  it('never draws a bar for work with no project', async () => {
    await panel({ tailSeconds: 360000, tailAmount: 9000, moreProjects: 1 });

    expect(bars().length).toBe(fourProjects.byProject.length);
    expect(region()?.textContent).not.toMatch(/no project/i);
  });

  /* Same rule as Velocity's mix, and the reason `MIX_OPACITY` is one export
     rather than a constant in each file: at full strength four hues across
     the panel pull harder than the running timer. */
  it('mutes its bars so they never out-shout the running timer', async () => {
    await panel();

    expect(bars().length).toBe(4);
    for (const bar of bars()) {
      const opacity = Number(bar.style.opacity);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    }
  });
});
