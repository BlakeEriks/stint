import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { cause, useBeatOf } from '@/lib/client/use-beat';
import type { Stats } from '@/lib/client/api';

/**
 * A beat is the difference between two consecutive arrivals, so every case
 * here is about which differences are events and which are not. Driven
 * through the hook rather than a mounted panel: the refs that hold the
 * previous arrival are the subject, and a render adds a network to fake.
 */

function arrival(total: number, seconds: number, awaiting = 0): Stats {
  return {
    currency: 'USD',
    unbilled: { total, seconds, byClient: [], moreClients: 0 },
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
    awaitingPayment: awaiting,
    attention: {
      overdueInvoices: [],
      staleDrafts: [],
      unprojected: [],
      strangeDurations: [],
    },
  };
}

const figures = (total: number, seconds: number, awaitingPayment = 0) => ({
  total,
  seconds,
  awaitingPayment,
});

describe('what counts as an event', () => {
  it('reads a stop off the hours axis', () => {
    expect(cause(figures(1000, 3600), figures(1150, 7200))).toBe('stop');
  });

  it('reads a raised invoice off awaiting payment', () => {
    expect(cause(figures(1000, 3600), figures(600, 3600, 400))).toBe('paid');
  });

  /* One refetch can carry two events, and a single net figure cannot tell
     them apart. The delta either would report has the other's movement mixed
     in, which is money the app would be inventing. */
  it('refuses to classify a stop and an invoice in one arrival', () => {
    expect(cause(figures(1000, 3600), figures(1100, 7200, 400))).toBeNull();
  });

  /* Money alone also moves when a rate is edited elsewhere, so hours are the
     only evidence a timer stopped. */
  it('is not an event when only the money moved', () => {
    expect(cause(figures(1000, 3600), figures(1200, 3600))).toBeNull();
  });

  it('has nothing to compare on a first arrival', () => {
    expect(cause(null, figures(1000, 3600))).toBeNull();
  });
});

describe('the beat holds only while it means something', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forgets the previous zone rather than reporting a stop', async () => {
    const before = arrival(1000, 3600);
    const after = arrival(1600, 9000);
    /* Two US zones that share a local DATE at this hour, deliberately: only
       the day BOUNDARY moves, which is the case the refs get wrong. */
    const { result, rerender } = renderHook(
      ({ a, zone }: { a: Stats; zone: string }) => useBeatOf(a, zone),
      { initialProps: { a: before, zone: 'America/New_York' } },
    );

    await waitFor(() => expect(result.current).toBeNull());

    /* The zone moves and the figures move with it — more hours fall inside
       the new zone's day. Nothing was worked; the window moved. */
    rerender({ a: after, zone: 'America/Los_Angeles' });

    /* Without the reset, `cause` reads a stop and reports the $600 difference
       between two timezones as money earned. The new zone's first arrival is
       a baseline, not a delta. */
    await waitFor(() => expect(result.current).toBeNull());
  });

  /* The effect's own comment forbids keying on `stats`, and it keyed on it
     anyway. The figures are what it reads, so the figures are what it
     depends on. */
  it('ignores object identity and still beats on the stop after it', async () => {
    const { result, rerender } = renderHook(
      ({ a }: { a: Stats }) => useBeatOf(a),
      {
        initialProps: { a: arrival(1000, 3600) },
      },
    );

    await waitFor(() => expect(result.current).toBeNull());

    /* The same three figures behind two more object identities, which is what
       a refetch stream looks like when nothing has moved. */
    rerender({ a: arrival(1000, 3600) });
    await waitFor(() => expect(result.current).toBeNull());
    rerender({ a: arrival(1000, 3600) });
    await waitFor(() => expect(result.current).toBeNull());

    /* None of those was an event, so none moved the baseline: the stop is
       measured from $1,000 and reports its full $150. */
    rerender({ a: arrival(1150, 7200) });
    await waitFor(() => expect(result.current?.kind).toBe('stop'));
    expect(result.current?.amount).toBe(150);
  });
});
