import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HomeCards } from '@/components/home-cards';
import type { Stats } from '@/lib/client/api';
import { localDateKey } from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';

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

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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

/** The Unbilled figure as rendered, stripped to digits for comparison. */
function figure(): string {
  const heading = screen.getByText('Unbilled');
  const header = heading.closest('header');
  if (!header) throw new Error('no Unbilled header');
  const el = header.querySelector('.type-figure .tabular-nums');
  return el?.textContent?.trim() ?? '';
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  localStorage.clear();
  reducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('count-up', () => {
  it('renders the settled figure under reduced motion', async () => {
    /* The figure IS the content, so suppressing the animation must leave the
       answer on screen. A hook that only skipped the tween would leave the
       seeded origin — here, the stored 500 — showing indefinitely. */
    reducedMotion(true);
    localStorage.setItem('stint.seen.unbilled', '500');
    serve(() => stats({ unbilled: unbilled(2000) }));

    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());
    // Immediately the server's figure, never the stored one and never zero.
    expect(figure()).toBe('$2,000.00');
    expect(figure()).not.toBe('$500.00');
  });

  it('does not animate a first load with no stored value', async () => {
    /* Nothing stored means no "since", so counting up from zero would report
       the user's whole history as though it had just happened. */
    expect(localStorage.getItem('stint.seen.unbilled')).toBeNull();
    serve(() => stats({ unbilled: unbilled(4200) }));

    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());
    // Settled on the first paint the figure appears in — no travel from 0.
    expect(figure()).toBe('$4,200.00');
    // And no period line, because there is no period to name.
    expect(screen.queryByText(/Since yesterday/)).toBeNull();
  });

  it('stores what it displayed, so the next arrival has a from', async () => {
    serve(() => stats({ unbilled: unbilled(4200) }));
    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(localStorage.getItem('stint.seen.unbilled')).toBe('4200'),
    );
  });

  /* The figure's travel and the line naming it now come from different
     state: the tween still animates from what this browser last DISPLAYED,
     while the line measures against the day's opening baseline. */
  it('names the period when the day opened at a smaller figure', async () => {
    localStorage.setItem('stint.seen.unbilled', '3750');
    localStorage.setItem(
      'stint.day',
      JSON.stringify({
        date: localDateKey(new Date(), tz),
        openedUnbilled: 3750,
        earnedToday: 0,
        lastUnbilled: 3750,
      }),
    );
    serve(() => stats({ unbilled: unbilled(4200) }));

    render(<HomeCards />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/Since yesterday/)).toBeVisible(),
    );
    expect(screen.getByText('+$450.00')).toBeVisible();
    // Settles on the server's figure once the tween lands.
    await waitFor(() => expect(figure()).toBe('$4,200.00'), SETTLE);
  });

  it('settles on exactly the server value after the tween', async () => {
    /* A tween that settles on its last interpolation rather than the target
       has silently changed what a billing screen reports.

       The figures are far apart and the target has cents, so a near-miss is
       VISIBLE at two decimals: settling a thousandth short of 98,765.43 reads
       as 98,667.66, while a target like 1,234.56 from a nearby origin would
       round back onto itself and hide the drift. */
    localStorage.setItem('stint.seen.unbilled', '1');
    serve(() => stats({ unbilled: unbilled(98765.43) }));

    render(<HomeCards />, { wrapper });

    await waitFor(() => expect(figure()).toBe('$98,765.43'), SETTLE);
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
    let current = stats({ unbilled: unbilled(100) });
    serve(() => current);

    render(<HomeCards />, { wrapper });
    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    // The hours move too: a stop is what adds them, and money alone also
    // moves when a rate is edited elsewhere.
    current = stats({ unbilled: unbilled(212.5, 7200) });
    await act(async () => {
      await client.refetchQueries();
    });

    /* The stop is now reported by the day's running total, which persists
       rather than retiring on a timer. The tone rule is unchanged. */
    const chip = await screen.findByText(/\+\$112\.50 today/);
    expect(chip).toBeVisible();
    // Classes, not inline style: the tone is a utility, so reading `style`
    // alone would pass against an accent-coloured chip.
    expect(chip.className).not.toMatch(/accent/);
    expect(chip.className).not.toMatch(/text-success/);
    expect(chip.getAttribute('data-earned')).toBe('today');
  });

  it('spends cyan on the paid beat and nowhere else', async () => {
    let current = stats({
      unbilled: unbilled(1000),
      velocity: velocity(5000, 4000),
    });
    serve(() => current);

    const { container } = render(<HomeCards />, { wrapper });
    await waitFor(() => expect(screen.getByText('Unbilled')).toBeVisible());

    // Before the beat, nothing on the screen is cyan.
    expect(container.querySelectorAll('.text-success')).toHaveLength(0);

    /* An invoice clears: unbilled work becomes invoiced. The gross is
       unchanged — the money moved across the split, it did not arrive. */
    current = stats({
      unbilled: unbilled(400),
      velocity: velocity(5000, 4600),
      awaitingPayment: 600,
    });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-beat="paid"]').length,
      ).toBeGreaterThan(0),
    );

    /* BOTH halves of the beat carry it: the delta beside Unbilled and
       Velocity's invoiced figure. Asserting only "some cyan exists" passed
       while Velocity's half compared a Beat object to a string and was
       permanently false — the money appeared to leave rather than move. */
    const cyan = () => [...container.querySelectorAll('.text-success')];
    expect(cyan().length).toBeGreaterThanOrEqual(2);
    expect(cyan().some((el) => el.textContent?.includes('$600.00'))).toBe(true);

    // Velocity's invoiced share, once its own tween has landed.
    await waitFor(
      () =>
        expect(cyan().some((el) => el.textContent?.includes('$4,600.00'))).toBe(
          true,
        ),
      SETTLE,
    );

    // And every cyan node on the screen is one of the beat's own.
    for (const el of cyan()) {
      expect(el.closest('[data-beat="paid"]')).not.toBeNull();
    }

    // Unbilled counted DOWN to the server's figure.
    await waitFor(() => expect(figure()).toBe('$400.00'), SETTLE);
  });

  it('survives a localStorage that throws', async () => {
    /* A private window refuses both halves. The figure still has to render. */
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };

    try {
      serve(() => stats({ unbilled: unbilled(900) }));
      render(<HomeCards />, { wrapper });
      await waitFor(() => expect(figure()).toBe('$900.00'), SETTLE);
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });
});
