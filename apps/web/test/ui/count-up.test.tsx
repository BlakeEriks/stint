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
    week: WEEK,
    month: MONTH,
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
      overlaps: [],
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

/** Seven quiet days. These cases are about the tween, not the bars. */
const WEEK = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-09-${String(14 + i).padStart(2, '0')}`,
  seconds: 0,
  amount: null,
}));

/** A month with no climb and no projection — again, not what is under test. */
const MONTH = {
  earned: 0,
  projected: null,
  businessDaysElapsed: 0,
  businessDaysTotal: 22,
  series: [],
  projection: null,
  byClient: [],
};

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

  /* Today's figure must move with the rest. A figure that sat still while
     the others travelled read as the stale one — which is what "the panel is
     not updating" actually looked like. */
  it("travels today's figure, not just the month's", async () => {
    const frame = controlledRaf();
    let current = stats({ earnedToday: 1000 });
    serve(() => current);

    const { container } = render(<HomeCards />, { wrapper });

    /* Today's own figure, never the month's: they are both `type-figure`
       tiers, so the region is what distinguishes them. */
    const today = () =>
      container.querySelectorAll('.type-figure')[0]?.textContent?.trim() ?? '';
    await waitFor(() => expect(today()).toBe('$1,000.00'));

    current = stats({ earnedToday: 9000 });
    await act(async () => {
      await client.refetchQueries();
    });

    const seen = await travel(today, frame);
    expect(today()).toBe('$9,000.00');

    const between = amounts(seen).filter((n) => n > 1000 && n < 9000);
    expect(between.length).toBeGreaterThan(0);
  });

  /* The month's Earned is the screen's hero figure and moves on the same
     edits, so it cannot be the one number that cuts. */
  it("travels the month's earned figure", async () => {
    const frame = controlledRaf();
    let current = stats({ month: { ...MONTH, earned: 1000 } });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    const earned = () =>
      document.querySelector('.type-figure-hero')?.textContent?.trim() ?? '';
    await waitFor(() => expect(earned()).toBe('$1,000.00'));

    current = stats({ month: { ...MONTH, earned: 9000 } });
    await act(async () => {
      await client.refetchQueries();
    });

    const seen = await travel(earned, frame);
    expect(earned()).toBe('$9,000.00');

    const between = amounts(seen).filter((n) => n > 1000 && n < 9000);
    expect(between.length).toBeGreaterThan(0);
  });
});
