import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fold, useDayState, type DayState } from '@/lib/client/use-day-state';
import type { Stats } from '@/lib/client/api';

/**
 * `fold` is the whole day-state rule, and every case that matters is about
 * what does NOT accumulate. Driven directly rather than through a render:
 * these are arrivals across a midnight and across an invoice, neither of
 * which a mounted component reaches without faking both the clock and the
 * network.
 */

const TODAY = '2026-09-17';

function day(over: Partial<DayState> = {}): DayState {
  return {
    date: TODAY,
    openedUnbilled: 1000,
    earnedToday: 0,
    lastUnbilled: 1000,
    ...over,
  };
}

describe('the day accumulates only what was earned', () => {
  it('adds a stop to the running total', () => {
    const next = fold(day(), { date: TODAY, unbilled: 1080 }, 'stop');

    expect(next.earnedToday).toBe(80);
    expect(next.lastUnbilled).toBe(1080);
  });

  it('sums a second stop rather than replacing the first', () => {
    const first = fold(day(), { date: TODAY, unbilled: 1080 }, 'stop');
    const second = fold(first, { date: TODAY, unbilled: 1200 }, 'stop');

    expect(second.earnedToday).toBe(200);
  });

  /* The rule most likely to be "fixed" back into a bug: unbilled falls when
     an invoice is raised, so a naive diff would subtract it. The work was
     still done today, and invoicing it does not undo it. */
  it('does not subtract a raised invoice from what today earned', () => {
    const earned = fold(day(), { date: TODAY, unbilled: 1080 }, 'stop');
    const invoiced = fold(earned, { date: TODAY, unbilled: 80 }, 'paid');

    expect(invoiced.earnedToday).toBe(80);
    /* The baseline still moves, or the next stop would be measured from a
       figure the screen no longer shows and would report the invoice back. */
    expect(invoiced.lastUnbilled).toBe(80);
  });

  /* A rate edited elsewhere moves the money without any work happening. */
  it('moves the baseline but earns nothing for an unclassified change', () => {
    const next = fold(day(), { date: TODAY, unbilled: 1500 }, null);

    expect(next.earnedToday).toBe(0);
    expect(next.lastUnbilled).toBe(1500);
  });

  /* Each stop adds a DIFFERENCE of two floats, so the residue compounds: a
     day of stops drifts off the cent the screen reports. */
  it('holds the running total to cents across many stops', () => {
    let state = day({ openedUnbilled: 0, lastUnbilled: 0 });
    let total = 0;
    for (let i = 0; i < 12; i += 1) {
      total += 0.07;
      state = fold(state, { date: TODAY, unbilled: total }, 'stop');
    }

    expect(state.earnedToday).toBe(0.84);
  });

  /* `0` is a valid amount: an unbillable stop earns nothing and must still
     settle as a stop rather than being read as "no event". */
  it('treats an unbillable stop as a stop worth nothing', () => {
    const next = fold(day(), { date: TODAY, unbilled: 1000 }, 'stop');

    expect(next.earnedToday).toBe(0);
  });
});

describe('a new day starts over', () => {
  it('zeroes what was earned when the date is stale', () => {
    const yesterday = day({ date: '2026-09-16', earnedToday: 450 });
    const next = fold(yesterday, { date: TODAY, unbilled: 1450 }, 'stop');

    expect(next.date).toBe(TODAY);
    expect(next.earnedToday).toBe(0);
  });

  /* The since-line means day over day, so the baseline is what YESTERDAY
     closed at. Taking today's opening figure instead would report a timer
     that ran over midnight as no movement at all. */
  it("measures from yesterday's close, not today's open", () => {
    const yesterday = day({ date: '2026-09-16', lastUnbilled: 1000 });
    const next = fold(yesterday, { date: TODAY, unbilled: 1120 }, null);

    expect(next.openedUnbilled).toBe(1000);
    expect(next.lastUnbilled).toBe(1120);
  });

  /* With no stored day there is no yesterday, so the current figure is the
     only honest baseline — the since-line stays silent until there is one. */
  it('takes the current figure as its baseline on a first-ever load', () => {
    const next = fold(null, { date: TODAY, unbilled: 1000 }, null);

    expect(next.openedUnbilled).toBe(1000);
    expect(next.earnedToday).toBe(0);
  });
});

/**
 * The corruption guard, which only a mount reaches: `read()` is private, and
 * a half-written store is exactly what it exists to reject. The figures it
 * feeds are money on a billing screen, so the failure mode that matters is
 * not a wrong number but `NaN` rendered as one.
 */
describe('a corrupt store earns nothing rather than NaN', () => {
  const NOON = new Date(2026, 8, 17, 12, 0, 0);

  function statsAt(total: number, seconds = 3600): Stats {
    return {
      currency: 'USD',
      unbilled: { total, seconds, byClient: [], moreClients: 0 },
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
      awaitingPayment: 0,
      attention: {
        overdueInvoices: [],
        staleDrafts: [],
        unprojected: [],
        strangeDurations: [],
      },
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOON);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /* A store written half-way — the tab closed mid-write, or an older shape
     that never had these fields. Every field is checked for a reason. */
  it('ignores a partially stored day', async () => {
    localStorage.setItem(
      'stint.day',
      JSON.stringify({ date: '2026-09-17', openedUnbilled: 1000 }),
    );

    /* One stable object: the hook's effect keys on `stats`, so a fresh
       object per render would re-run it forever. */
    const arrival = statsAt(1200);
    const { result } = renderHook(() => useDayState(arrival));

    await waitFor(() => expect(result.current.earnedToday).not.toBeNull());
    expect(result.current.earnedToday).toBe(0);
    /* Rejected outright, so there is no yesterday to measure from and the
       since-line stays silent rather than reporting a figure off a
       half-written baseline. */
    expect(result.current.sinceOpen).toBeNull();
  });

  /* The shape that actually produces `NaN`: the fields are present, so a
     guard that only checked for their existence would let these through and
     every delta downstream would be `NaN`. */
  it('ignores a stored day whose figures are not numbers', async () => {
    localStorage.setItem(
      'stint.day',
      JSON.stringify({
        date: '2026-09-17',
        openedUnbilled: 'lots',
        earnedToday: null,
        lastUnbilled: 1000,
      }),
    );

    const arrival = statsAt(1200);
    const { result } = renderHook(() => useDayState(arrival));

    await waitFor(() => expect(result.current.earnedToday).not.toBeNull());
    expect(result.current.earnedToday).toBe(0);
    expect(Number.isNaN(result.current.earnedToday)).toBe(false);
    expect(result.current.sinceOpen).toBeNull();
  });

  /* The day is the browser's local one, and a timer left running over
     midnight is the ordinary case: the second arrival lands on a new date,
     so today's earnings start over rather than carrying yesterday's on. */
  it('rolls the day over when a refetch crosses local midnight', async () => {
    localStorage.setItem(
      'stint.day',
      JSON.stringify({
        date: '2026-09-17',
        openedUnbilled: 1000,
        earnedToday: 0,
        lastUnbilled: 1000,
      }),
    );

    /* One object per ARRIVAL, not per render: the hook's effect keys on the
       `stats` object, so re-deriving it each render never settles. */
    const first = statsAt(1080);
    const second = statsAt(1200);
    const { result, rerender } = renderHook(
      ({ arrival }: { arrival: Stats }) => useDayState(arrival),
      { initialProps: { arrival: first } },
    );

    await waitFor(() => expect(result.current.earnedToday).toBe(0));
    // Since yesterday's close, which the stored day supplies.
    expect(result.current.sinceOpen).toBe(80);

    vi.setSystemTime(new Date(2026, 8, 18, 0, 30, 0));
    rerender({ arrival: second });

    /* A new day: the baseline becomes what yesterday CLOSED at (1080), so
       the since-line reads 120 and nothing carries over as earnings. */
    await waitFor(() => expect(result.current.sinceOpen).toBe(120));
    expect(result.current.earnedToday).toBe(0);
  });
});

/**
 * What the hook compares each arrival against, and when it must forget it.
 *
 * Both rules here are about the REFS rather than the fold: a snapshot kept
 * when it should have been dropped, or advanced when nothing happened, turns
 * the next honest stop into a figure nobody earned. Neither is reachable
 * through `fold` alone — they only exist across arrivals.
 */
describe('the baseline is kept only while it means something', () => {
  const NOON = new Date(2026, 8, 17, 12, 0, 0);

  function arrival(total: number, seconds: number, awaiting = 0): Stats {
    return {
      currency: 'USD',
      unbilled: { total, seconds, byClient: [], moreClients: 0 },
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
      awaitingPayment: awaiting,
      attention: {
        overdueInvoices: [],
        staleDrafts: [],
        unprojected: [],
        strangeDurations: [],
      },
    };
  }

  /** A stored day, so neither test is measuring a first-ever load. */
  function storeDay(unbilled: number) {
    localStorage.setItem(
      'stint.day',
      JSON.stringify({
        date: '2026-09-17',
        openedUnbilled: unbilled,
        earnedToday: 0,
        lastUnbilled: unbilled,
      }),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOON);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  /* `keys.stats(tz)` carries the timezone, so a change refetches as a NEW
     query whose figures describe a different day boundary. Diffed against
     the previous zone's snapshot, the difference between two timezones is
     folded in as work — the app inventing earnings out of a clock change. */
  it('forgets the previous zone rather than earning the difference', async () => {
    storeDay(1000);

    const before = arrival(1000, 3600);
    const after = arrival(1600, 9000);
    /* Two US zones that share a local DATE at this hour, deliberately: a
       zone whose date differs sends `fold` down its new-day branch, which
       zeroes the figure for an unrelated reason and hides the bug. Here only
       the day BOUNDARY moves, which is the case the refs get wrong. */
    const { result, rerender } = renderHook(
      ({ a, zone }: { a: Stats; zone: string }) => useDayState(a, zone),
      { initialProps: { a: before, zone: 'America/New_York' } },
    );

    await waitFor(() => expect(result.current.earnedToday).toBe(0));

    /* The zone moves and the figures move with it — more hours fall inside
       the new zone's day. Nothing was worked; the window moved. */
    rerender({ a: after, zone: 'America/Los_Angeles' });

    /* Without the reset, `cause` reads a stop and the fold adds the $600
       difference between two timezones as money earned. The new zone's
       first arrival is a baseline, not a delta. */
    await waitFor(() => expect(result.current.sinceOpen).toBe(600));
    expect(result.current.earnedToday).toBe(0);
  });

  /* The effect's own comment forbids keying on `stats`, and it keyed on it
     anyway. The figures are what it reads, so the figures are what it
     depends on — and the retirement timer is where object identity does
     observable harm (`home-cards.test.tsx` pins that). What is pinned here
     is the fold: any number of identity-only arrivals must leave the
     baseline where it was, so the stop after them earns its full amount. */
  it('ignores object identity and still earns the stop after it', async () => {
    storeDay(1000);

    const { result, rerender } = renderHook(
      ({ a }: { a: Stats }) => useDayState(a),
      { initialProps: { a: arrival(1000, 3600) } },
    );

    await waitFor(() => expect(result.current.earnedToday).toBe(0));

    /* The same three figures behind two more object identities, which is
       what a refetch stream looks like when nothing the day cares about has
       moved. */
    rerender({ a: arrival(1000, 3600) });
    await waitFor(() => expect(result.current.earnedToday).toBe(0));
    rerender({ a: arrival(1000, 3600) });
    await waitFor(() => expect(result.current.earnedToday).toBe(0));

    /* None of those was an event, so none moved the baseline: the stop is
       measured from $1,000 and earns its full $150. */
    rerender({ a: arrival(1150, 7200) });
    await waitFor(() => expect(result.current.earnedToday).toBe(150));
    expect(result.current.beat?.kind).toBe('stop');
    expect(result.current.beat?.amount).toBe(150);
  });
});
