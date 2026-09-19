import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
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
    earnedToday: 0,
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
    },
    ...over,
  } as Stats;
}

/** Unbilled with one client, at whatever the figure and hours should be. */
function unbilled(total: number, seconds = 3600) {
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

function velocity(total: number, invoiced: number) {
  return {
    months: 3,
    total,
    perMonth: Math.round((total / 3) * 100) / 100,
    invoiced,
    unbilled: total - invoiced,
    seconds: 7200,
    byClient: [
      {
        clientId: 'c1',
        clientName: 'Northwind',
        currency: 'USD',
        seconds: 7200,
        invoiced,
        unbilled: total - invoiced,
        unratedCount: 0,
      },
    ],
    moreClients: 0,
  };
}

/** Serves whatever `current` points at, so a refetch can return new figures. */
function serve(get: () => Stats) {
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

let client: QueryClient;

/* StrictMode, because the app runs under it — Next enables it whenever
   `reactStrictMode` is unset, which `next.config.ts` leaves unset. It double-
   invokes every effect (mount, cleanup, mount), and a tween whose effect is
   not idempotent silently stops animating in the real app while a wrapper
   without it stays green. That gap once shipped a change that did nothing. */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StrictMode>
  );
}

/** Drive `prefers-reduced-motion`, which the hook reads through matchMedia. */
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

/**
 * Long enough for a tween to land under a loaded runner.
 *
 * The tween ends on a `requestAnimationFrame` callback, and the suite runs
 * 28 jsdom environments at once — frames starve, so a 160ms animation can
 * take several seconds of wall clock. The assertion is that it settles on the
 * server's figure, never how fast.
 */
const SETTLE = { timeout: 8000 };

/**
 * A rAF the TEST clocks, replacing the browser's.
 *
 * The travel cases used to sample the DOM from a real `setInterval(…, 8)`
 * racing the tween. Whether any sample landed mid-flight was then a question
 * about the machine: on a loaded box the whole 900ms could pass between two
 * ticks, leaving only the endpoints, and "the figure travels" failed on a
 * hook that was working perfectly.
 *
 * So frames are driven rather than awaited. `frame(ms)` advances a clock the
 * hook reads through `performance.now()` and runs whatever it has scheduled,
 * which makes the intermediate frame something the test PERFORMS. A tween
 * that cut straight to its target still schedules nothing to observe, so the
 * claim is unweakened — only its timing is no longer a race.
 */
function controlledRaf() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = next++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);

  /** Advance the clock and run every frame that was waiting on it. */
  return async function frame(ms: number) {
    now += ms;
    const due = [...pending];
    pending.clear();
    await act(async () => {
      for (const [, cb] of due) cb(now);
    });
  };
}

/** Every distinct money value the figure shows across a driven tween. */
async function travel(
  read: () => string,
  frame: (ms: number) => Promise<void>,
  steps = 12,
) {
  const seen = new Set<string>([read()]);
  for (let i = 0; i < steps; i++) {
    await frame(DURATION / steps);
    seen.add(read());
  }
  /* One frame past the end. The steps divide the duration exactly, so the
     last of them lands ON it rather than after — and `t >= 1` is what settles
     the figure on the target. */
  await frame(DURATION);
  seen.add(read());
  return seen;
}

/** `--motion-count`, the tween's length, as `use-count-up` sets it. */
const DURATION = 900;

/** The money values among the samples, as numbers. */
function amounts(seen: Set<string>): number[] {
  return [...seen]
    .filter((t) => /^\$[\d,]+\.\d\d$/.test(t))
    .map((t) => Number(t.replace(/[$,]/g, '')));
}

/**
 * The Unbilled figure as rendered, stripped to digits for comparison.
 *
 * It lives in the Owed half now rather than leading the panel — these cases
 * are about the tween, and it is still the figure the `unbilled` fixture
 * drives. Read off its own label, because the panel carries several money
 * figures and they all tween.
 */
function figure(): string {
  /* Exact, because "Unbilled by client" heads the list below it and a
     substring match would take whichever came first. */
  const label = screen.getByText('Unbilled', { exact: true });
  /* label -> its swatch+label row -> the column holding the amount. */
  const column = label.parentElement?.parentElement;
  return column?.querySelector('.type-amount-hero')?.textContent?.trim() ?? '';
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  reducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  /* `controlledRaf` mocks `performance.now`; a test that does not drive frames
     needs the real clock back, or its tween never advances and it times out. */
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('count-up', () => {
  it('renders the settled figure under reduced motion', async () => {
    /* The figure IS the content, so suppressing the animation must leave the
       answer on screen. A hook that only skipped the tween would leave the
       seeded origin — here, the stored 500 — showing indefinitely. */
    reducedMotion(true);
    let current = stats({ unbilled: unbilled(500) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() => expect(figure()).toBe('$500.00'));

    current = stats({ unbilled: unbilled(2000) });
    await act(async () => {
      await client.refetchQueries();
    });

    // Immediately the server's figure, never the previous one and never zero.
    await waitFor(() => expect(figure()).toBe('$2,000.00'));
    expect(figure()).not.toBe('$500.00');
  });

  /* A load has nothing on screen to travel from, so the origin is chosen
     rather than remembered. It must be NEAR the figure: counting up from zero
     would put a balance the user does not have in front of them and animate
     their whole history as though it had just happened. */
  it('arrives from near the figure on load, never from zero', async () => {
    const frame = controlledRaf();
    serve(() => stats({ unbilled: unbilled(4200) }));

    render(<HomeCards />, { wrapper });
    /* The settled figure is also the FIRST paint — the arrival is applied by
       the effect — so the tween has to be driven to see where it starts. */
    await waitFor(() => expect(figure()).toBe('$4,200.00'));

    const seen = await travel(figure, frame);

    // Leaves its settled value, then comes back to it.
    expect(seen.size).toBeGreaterThan(1);
    expect(figure()).toBe('$4,200.00');

    const money = amounts(seen);
    expect(money.length).toBeGreaterThan(1);
    // Never a balance the user does not have: the origin is NEAR the figure.
    expect(Math.min(...money)).toBeGreaterThan(4200 * 0.9);
  });

  it('settles on exactly the server value after the tween', async () => {
    /* A tween that settles on its last interpolation rather than the target
       has silently changed what a billing screen reports.

       The figures are far apart and the target has cents, so a near-miss is
       VISIBLE at two decimals: settling a thousandth short of 98,765.43 reads
       as 98,667.66, while a target like 1,234.56 from a nearby origin would
       round back onto itself and hide the drift. */
    let current = stats({ unbilled: unbilled(1) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() => expect(figure()).toBe('$1.00'));

    current = stats({ unbilled: unbilled(98765.43) });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() => expect(figure()).toBe('$98,765.43'), SETTLE);
  });

  /* Every other test here asserts where the figure LANDS, which a hook that
     cut straight to the new value would also satisfy — the animation was
     removable with the whole suite still green. This one pins the travel
     itself: at least one frame between the two figures, and none outside
     them. */
  it('travels through intermediate values rather than cutting', async () => {
    const frame = controlledRaf();
    let current = stats({ unbilled: unbilled(1000) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() => expect(figure()).toBe('$1,000.00'));

    current = stats({ unbilled: unbilled(9000) });
    await act(async () => {
      await client.refetchQueries();
    });

    const seen = await travel(figure, frame);
    expect(figure()).toBe('$9,000.00');

    const money = amounts(seen);
    const between = money.filter((n) => n > 1000 && n < 9000);
    expect(between.length).toBeGreaterThan(0);

    // And it never overshoots either end of the journey.
    for (const n of money) {
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(n).toBeLessThanOrEqual(9000);
    }
  });

  /* The breakdown must move with the figure it breaks down. A row that sat
     still while the headline above it travelled read as the stale one — which
     is what "by client is not updating" actually looked like. */
  it('travels the by-client rows, not just the headline', async () => {
    const frame = controlledRaf();
    let current = stats({ unbilled: unbilled(1000) });
    serve(() => current);

    const { container } = render(<HomeCards />, { wrapper });
    await waitFor(() => expect(figure()).toBe('$1,000.00'));

    /* The row's own amount, never the headline's: they share a value in this
       fixture, so reading the wrong node would pass on the headline alone. */
    const row = () => {
      const li = container.querySelector('ul li');
      return li?.querySelector('.type-duration')?.textContent?.trim() ?? '';
    };
    await waitFor(() => expect(row()).toBe('$1,000.00'));

    current = stats({ unbilled: unbilled(9000) });
    await act(async () => {
      await client.refetchQueries();
    });

    const seen = await travel(row, frame);
    expect(row()).toBe('$9,000.00');

    const between = amounts(seen).filter((n) => n > 1000 && n < 9000);
    expect(between.length).toBeGreaterThan(0);
  });

  /* Velocity's headline sits in the same figure slot as Unbilled's and moves
     on the same edits, so it cannot be the one number that cuts. */
  it("travels velocity's per-month figure", async () => {
    const frame = controlledRaf();
    let current = stats({ velocity: velocity(3000, 3000) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    const perMonth = () => {
      const head = screen.getByText('Velocity').closest('header');
      /* The Money span INSIDE the header's figure slot, which names the
         same role the slot does — the slot itself also holds the `/mo gross`
         suffix. */
      return (
        head?.querySelector('.type-figure .type-figure')?.textContent?.trim() ??
        ''
      );
    };
    await waitFor(() => expect(perMonth()).toBe('$1,000.00'));

    current = stats({ velocity: velocity(27000, 27000) });
    await act(async () => {
      await client.refetchQueries();
    });

    const seen = await travel(perMonth, frame);
    expect(perMonth()).toBe('$9,000.00');

    const between = amounts(seen).filter((n) => n > 1000 && n < 9000);
    expect(between.length).toBeGreaterThan(0);
  });

  it('moves hours, not money, on an unbillable stop', async () => {
    /* An unbillable stop resolves to no money. A stop that moved nothing
       would teach the user that marking work billable is what makes the app
       react — the UI arguing with the data's honesty. */
    let current = stats({ unbilled: unbilled(0, 3600) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    // The stop adds an hour and no money at all.
    current = stats({ unbilled: unbilled(0, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() => expect(screen.getByText(/unbillable/)).toBeVisible());
    const chip = screen.getByText(/unbillable/);
    // Reports the hours it did move, and no currency at all.
    expect(chip.textContent).toMatch(/1h/);
    expect(chip.textContent).not.toMatch(/\$/);
  });

  it('marks a billable stop neutrally, never with the accent', async () => {
    /* The accent is the running timer, and a stop has just ended one. */
    let current = stats({ unbilled: unbilled(0, 3600) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('Unbilled', { exact: true })).toBeVisible(),
    );

    /* An unbillable stop: the hours move and the money does not, which is the
       one stop the figure alone cannot report — so it is the one that renders
       a chip. A priced stop is already described by the figure travelling. */
    current = stats({ unbilled: unbilled(0, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    const chip = await waitFor(() => {
      const el = document.querySelector('[data-beat="stop"]');
      if (!el) throw new Error('no stop chip');
      return el as HTMLElement;
    });
    expect(chip).toBeVisible();
    // Classes, not inline style: the tone is a utility, so reading `style`
    // alone would pass against an accent-coloured chip.
    expect(chip.className).not.toMatch(/accent/);
    expect(chip.className).not.toMatch(/text-success/);
  });

  it('spends the success colour on the paid beat and nowhere else', async () => {
    let current = stats({
      unbilled: unbilled(400),
      velocity: velocity(5000, 4600),
      awaitingPayment: 600,
    });
    serve(() => current);

    const { container } = render(<HomeCards />, { wrapper });
    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    // Before the beat, nothing on the screen carries it.
    expect(container.querySelectorAll('.text-success')).toHaveLength(0);

    /* A cheque clears. Money LEAVES what is awaiting and lands in collected —
       the gross is unchanged, because the work was already done. Raising an
       invoice moves the same money the other way and is a `sent` beat, which
       spends no colour. */
    current = stats({
      unbilled: unbilled(400),
      velocity: velocity(5000, 4600),
      awaitingPayment: 0,
      collected: {
        trailing12: 600,
        thisMonth: 600,
        daysSincePaid: 0,
        byMonth: [],
      },
    });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-beat="paid"]').length,
      ).toBeGreaterThan(0),
    );

    /* The arrival, reported where the money landed. */
    const paid = () => [...container.querySelectorAll('.text-success')];
    expect(paid().some((el) => el.textContent?.includes('$600.00'))).toBe(true);

    // And every one on the screen is the beat's own.
    for (const el of paid()) {
      expect(el.closest('[data-beat="paid"]')).not.toBeNull();
    }

    /* Velocity's headline stays NEUTRAL. It reports gross earned, which a
       payment does not move — the work was done and invoiced already. The
       colour marks the one outcome on the screen, and spreading it over a
       figure that did not change spends it on nothing. */
    await waitFor(
      () =>
        expect(paid().some((el) => el.textContent?.includes('$1,666.67'))).toBe(
          false,
        ),
      SETTLE,
    );

    /* Unbilled holds: a payment collects money that LEFT unbilled when the
       invoice was raised, so counting it down again would subtract the same
       work twice. */
    await waitFor(() => expect(figure()).toBe('$400.00'), SETTLE);
  });
});
