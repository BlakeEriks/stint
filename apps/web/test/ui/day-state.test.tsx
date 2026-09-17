import { describe, it, expect } from 'vitest';
import { fold, type DayState } from '@/lib/client/use-day-state';

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
    expect(String(state.earnedToday)).not.toMatch(/\d{5,}/);
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
