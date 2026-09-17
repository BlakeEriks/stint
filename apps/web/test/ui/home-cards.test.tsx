import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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

describe('the panel header', () => {
  /* The date answers "is this figure current?" — the question a dashboard
     that mostly does not change invites. */
  it('names the day on the left and the date on the right', async () => {
    serve(stats({ unbilled: oneClient }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    const now = new Date();
    const day = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
    }).format(now);
    const date = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
    }).format(now);

    const heading = screen.getByRole('heading', { name: day });
    const head = heading.closest('div')?.parentElement;
    expect(head).not.toBeNull();
    expect(head?.textContent).toContain(date);
  });

  /* The since-line describes the SCREEN, not Unbilled: the money moved and
     so did the invoice it was raised against. */
  it('carries the since-line, which Unbilled does not', async () => {
    window.localStorage.setItem('stint.seen.unbilled', '3000');
    serve(stats({ unbilled: oneClient }));
    render(<HomeCards />, { wrapper });

    const since = await screen.findByText(/Since you last looked/);

    const heading = screen.getByRole('heading', {
      name: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
        new Date(),
      ),
    });
    expect(heading.closest('div')).toContainElement(since);
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
       Every separator is inset to the rows' own edge, whatever that
       measure is — the property is that it stops short of the panel. */
    const rules = [...container.querySelectorAll('div.border-t')];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect([...r.classList].some((c) => /^mx-\d/.test(c))).toBe(true);
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

  it('splits the window into invoiced and unbilled without double-counting', async () => {
    serve(stats({ velocity }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/invoiced/)).toBeInTheDocument(),
    );
    /* `invoiced + unbilled` IS the window's gross; the split moves as
       invoices are raised while the gross does not. */
    expect(screen.getByText('$6,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('$3,000.00').length).toBeGreaterThan(0);
    // The two halves summed on top of the gross would be $15,000.
    expect(screen.queryByText('$15,000.00')).toBeNull();
  });

  it('reports the figure per month, so two windows are comparable', async () => {
    serve(stats({ velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('/mo gross')).toBeInTheDocument(),
    );
    /* $9,000 over three months. The window total carries no rate, so two
       users on different windows cannot compare it. */
    const figure = container.querySelector('.type-figure');
    expect(figure?.textContent).toContain('$3,000.00');
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
    const { container } = render(<HomeCards />, { wrapper });

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
    expect(container.querySelectorAll('.bg-accent').length).toBe(0);
  });
});

describe('the panel pairs its regions', () => {
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
    expect(pairs.length).toBe(2);

    for (const pair of pairs) {
      const classes = [...pair.classList];
      // Every column class is container-scoped (`@2xl:`), never bare `md:`.
      const cols = classes.filter((c) => c.includes('grid-cols-'));
      expect(cols.length).toBeGreaterThan(0);
      for (const c of cols) expect(c).toMatch(/^@[a-z0-9]+:/);
      expect(classes.filter((c) => /^(sm|md|lg|xl|2xl):/.test(c))).toEqual([]);
    }
  });

  it('pairs Unbilled with By-client and the month with Velocity', async () => {
    serve(stats({ unbilled: oneClient, velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('By client')).toBeInTheDocument(),
    );

    /* The pairing is the layout. By-client is its own region rather than a
       list under the figure, which is what leaves room for the pairing at
       all — and half of why the two money regions stopped looking alike. */
    const pairs = [...container.querySelectorAll('div.grid')].filter((d) =>
      [...d.classList].some((c) => c.includes('grid-cols-')),
    );
    const headings = pairs.map((p) =>
      [...p.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
    );
    expect(headings[0]).toEqual(['Unbilled', 'By client']);
    expect(headings[1]?.[1]).toMatch(/velocity/i);
  });

  /* A vertical rule between the columns rebuilds the gridlines this whole
     feature removed. Every separator on this screen is horizontal and inset. */
  it('never draws a vertical divider between the columns', async () => {
    serve(stats({ unbilled: oneClient, velocity }));
    const { container } = render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('By client')).toBeInTheDocument(),
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
    localStorage.clear();
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

  it('still counts a plain billable stop up with its delta', async () => {
    /* The behaviour that was already right: hours and money both arrive, so
       the beat is a stop and the delta is what the stop earned. Neutral, not
       the accent — the accent is the running timer, which just ended. */
    let current = stats({ unbilled: unbilledAt(100, 3600) });
    serveMoving(() => current);

    const { container } = render(<HomeCards />, { wrapper: movingWrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled')).toBeInTheDocument(),
    );

    current = stats({ unbilled: unbilledAt(212.5, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    const chip = await screen.findByText('+$112.50');
    expect(chip.getAttribute('data-beat')).toBe('stop');
    expect(chip.className).not.toMatch(/accent/);
    expect(chip.className).not.toMatch(/text-success/);
    expect(beats(container).length).toBeGreaterThan(0);
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
});
