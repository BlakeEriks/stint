'use client';

import { useEffect, useRef, useState } from 'react';
import { localDateKey } from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import type { Stats } from '@/lib/client/api';

/**
 * What this browser has seen happen today.
 *
 * Two figures on the home panel describe a period rather than a fetch — what
 * was earned today, and what has moved since yesterday — and neither can be
 * derived from a single `/stats` response. Both are held here, in one object,
 * so they cannot disagree about which day it is.
 *
 * Per **device**, never account state: like `use-count-up.ts`, these describe
 * what THIS browser has shown you, and two machines disagreeing is correct.
 */

/**
 * Why the figures moved, read off the figures themselves.
 *
 * The beats are reactions to mutations that happen on other screens — the
 * timer bar, the inbox, an invoice — and a region that subscribed to each of
 * them would be a region that knows about all of them. `/stats` is already
 * invalidated by every one, so the refetch carries the news.
 *
 * Two axes, because one refetch can carry two events and a single net figure
 * cannot tell them apart. Hours are the only evidence a timer stopped: money
 * alone also moves when a rate is edited elsewhere. `awaitingPayment` is the
 * only evidence an invoice was raised, and it moves independently of
 * `unbilled` rather than being netted against it.
 *
 * Both at once resolves to null. The delta each would report is the other's
 * movement mixed in, and a figure that is the net of two unrelated events is
 * money the app would be inventing.
 */
/**
 * The three figures a classification is read from.
 *
 * Scalars rather than the `Stats` object: React Query returns a new object
 * whenever ANY field changes, so a caller holding the object in a ref or a
 * dependency list reacts to changes that carry no event.
 */
export type Figures = {
  total: number;
  seconds: number;
  awaitingPayment: number;
};

export const figuresOf = (s: Stats): Figures => ({
  total: s.unbilled.total,
  seconds: s.unbilled.seconds,
  awaitingPayment: s.awaitingPayment,
});

export function cause(
  prev: Figures | null,
  next: Figures,
): 'stop' | 'paid' | null {
  if (!prev) return null;
  const stopped = next.seconds > prev.seconds;
  const raised = next.awaitingPayment > prev.awaitingPayment;
  if (stopped === raised) return null;
  return stopped ? 'stop' : 'paid';
}

export type Beat = {
  kind: 'stop' | 'paid';
  amount: number;
  seconds: number;
  /** Whether the stopped work carries a rate at all, read off the money axis
   *  at the moment of the stop rather than re-derived from the net amount.
   *  `null` when the arrival cannot say — the label is suppressed rather
   *  than guessed. */
  billable: boolean | null;
} | null;

/**
 * How long the delta stays beside the figure once the tween has landed.
 *
 * Exported for the retirement test, which advances a fake clock past it: a
 * test holding its own copy of the number passes against a changed one.
 */
export const BEAT_MS = 2600;

/** One key per origin, holding both deltas' state as one object. */
const KEY = 'stint.day';

export type DayState = {
  /** A LOCAL date string. Staleness here is the whole reset mechanism. */
  date: string;
  /** Unbilled as of the first load of this day — the since-line's baseline. */
  openedUnbilled: number;
  /** The sum of what stopped today — the chip. */
  earnedToday: number;
  /** What the last fetch showed, so the next one has something to diff. */
  lastUnbilled: number;
};

/** The local date, which is when these figures reset. */
export function today(zone: string = tz): string {
  return localDateKey(new Date(), zone);
}

function read(): DayState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<DayState>;
    /* Every field checked, because a half-written object would otherwise
       produce `NaN` deltas that render as a figure. `0` is valid throughout,
       so these are type checks and never truthiness. */
    if (
      typeof parsed.date !== 'string' ||
      !Number.isFinite(parsed.openedUnbilled) ||
      !Number.isFinite(parsed.earnedToday) ||
      !Number.isFinite(parsed.lastUnbilled)
    ) {
      return null;
    }
    return parsed as DayState;
  } catch {
    return null;
  }
}

function write(state: DayState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A private window can refuse writes. The figures still render; the
    // deltas just have nothing to measure against.
  }
}

/**
 * Round to cents.
 *
 * Every stop adds a DIFFERENCE of two floats, so the residue compounds across
 * a day: eight stops left `earnedToday` at 0.3800000000046566 in one sitting.
 * It renders correctly at two decimals today and stops doing so once the
 * error reaches a half-cent, which on a billing screen is the app quietly
 * reporting a figure nobody earned.
 */
function cents(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * A fresh day.
 *
 * The baseline is what the PREVIOUS day closed at, not what today opens at.
 * The two differ whenever the figures moved while the app was shut — a timer
 * left running over midnight is the ordinary case — and taking today's figure
 * would report that movement as nothing. With no previous day there is no
 * yesterday to measure from, so the current figure stands in and the
 * since-line stays silent until there is.
 */
function open(date: string, unbilled: number, closed?: number): DayState {
  return {
    date,
    openedUnbilled: closed ?? unbilled,
    earnedToday: 0,
    lastUnbilled: unbilled,
  };
}

/**
 * Fold one `/stats` arrival into the day's state.
 *
 * Pure, and exported for the tests: the two rules worth pinning are both
 * about what does NOT accumulate, and neither is observable through a render
 * without driving a refetch.
 *
 * `cause` is passed in rather than recomputed here, so the fold and the beat
 * chip read one classification and cannot disagree about what happened.
 */
export function fold(
  prev: DayState | null,
  next: { date: string; unbilled: number },
  cause: 'stop' | 'paid' | null,
): DayState {
  // A stale date is a new day: the old figures describe a period that ended,
  // and its closing figure becomes what today is measured against.
  if (!prev) return open(next.date, next.unbilled);
  if (prev.date !== next.date)
    return open(next.date, next.unbilled, prev.lastUnbilled);

  /* Only a stop is earning. A raised invoice moves money out of unbilled
     without any work happening, and today's work was still done — subtracting
     it here would report the day as though the hours had been given back.
     Anything else (a rate edited elsewhere, an entry deleted) moves the
     baseline but is not work, so it updates `lastUnbilled` alone. */
  const earned =
    cause === 'stop'
      ? cents(prev.earnedToday + (next.unbilled - prev.lastUnbilled))
      : prev.earnedToday;

  return { ...prev, earnedToday: earned, lastUnbilled: next.unbilled };
}

/**
 * The day's two deltas, updated as `/stats` arrives.
 *
 * Returns `null` for both on the first-ever load: with nothing stored there
 * is no period to name, and reporting the user's whole history as today's
 * earnings is the kind of invented figure this screen must never show.
 */
/**
 * Whether a stop's work was rated, judged on the money axis at the stop.
 *
 * A stop that moves `total` up earned money, so it was billable.
 *
 * A net of zero has two causes, and the standing figure tells them apart. If
 * there was no rated work before the stop and none after — `total` is zero on
 * both sides — then nothing on this screen has a rate and the stop is
 * genuinely unbillable. If there IS rated work and the total did not move,
 * something offset it: a rate edited elsewhere in the same refetch. That is
 * evidence about the rate, not about this work, so it resolves to `null` and
 * the label is dropped rather than guessed. Calling money the user is about
 * to invoice "unbillable" is the app misreporting a fact about billing.
 *
 * A net BELOW zero is the same offsetting case, more plainly.
 */
function billabilityOf(
  kind: 'stop' | 'paid',
  amount: number,
  before: number,
  after: number,
): boolean | null {
  if (kind === 'paid') return true;
  if (amount > 0) return true;
  if (amount === 0 && before === 0 && after === 0) return false;
  return null;
}

/**
 * The last thing that happened, for as long as it is worth saying.
 *
 * Retires itself on a timer: the delta answers "what just changed", and a
 * chip still sitting there minutes later is answering a question the user has
 * stopped asking — and would be read as part of the figure.
 *
 * Called ONCE for the whole panel. A second caller would hold its own ref and
 * its own timeout, so the chip beside Unbilled and the cyan highlight in
 * Velocity could fire and retire independently, and a region mounting late
 * would miss a transition the other had already consumed.
 */
function useBeat(
  total: number,
  seconds: number,
  awaitingPayment: number,
  epoch: string,
): Beat {
  const prev = useRef<Figures | null>(null);
  const era = useRef(epoch);
  const [beat, setBeat] = useState<Beat>(null);

  useEffect(() => {
    const next = { total, seconds, awaitingPayment };
    /* A new timezone is a new query key, so React Query refetches and the
       figures that arrive describe a different day boundary. Comparing them
       against the old zone's snapshot reports the difference between two
       timezones as money earned. The snapshot is dropped instead, and the
       first arrival under the new zone becomes the baseline. */
    const crossed = era.current !== epoch;
    era.current = epoch;
    const before = crossed ? null : prev.current;
    prev.current = next;
    const kind = cause(before, next);
    if (!kind || !before) return;

    /* Each kind takes its amount from the axis its own event moves: a raised
       invoice is what landed in `awaitingPayment`, never the net of unbilled,
       which a concurrent stop would have already mixed into. */
    const amount =
      kind === 'paid'
        ? awaitingPayment - before.awaitingPayment
        : total - before.total;
    setBeat({
      kind,
      amount,
      seconds: seconds - before.seconds,
      billable: billabilityOf(kind, amount, before.total, total),
    });
    const t = setTimeout(() => setBeat(null), BEAT_MS);
    return () => clearTimeout(t);
  }, [total, seconds, awaitingPayment, epoch]);

  return beat;
}

/**
 * @param zone The timezone the `/stats` query is keyed by. It is part of the
 *   cache key, so a change refetches as a NEW query whose figures describe a
 *   different day boundary — the refs that hold the previous arrival must be
 *   dropped with it, or the difference between two timezones is folded into
 *   today's earnings as work nobody did. Defaults to this browser's zone,
 *   which is what the app passes.
 */
export function useDayState(
  stats: Stats | null | undefined,
  zone: string = tz,
) {
  const ready = stats != null;
  const settled = stats?.unbilled.total ?? 0;

  /* Captured before the first write lands. After that the stored baseline IS
     this figure, and the since-line would measure zero forever. */
  const opened = useRef<DayState | null | undefined>(undefined);
  const [state, setState] = useState<DayState | null>(null);

  /* The previous arrival, so the classification sees the same two snapshots
     the beat does. Advanced INSIDE the effect, never during render: a render
     that advanced it would leave the effect comparing a snapshot against
     itself, which resolves as "nothing happened" and silently drops the stop
     that had just been folded in. */
  const last = useRef<Figures | null>(null);
  const era = useRef(zone);

  if (opened.current === undefined && ready) {
    opened.current = read();
  }

  /* The three scalars the effect actually reads, lifted out of `stats` so the
     dependency list below can name them — exactly as `useBeat` does, and for
     the same reason its own comment gives. */
  const seconds = stats?.unbilled.seconds ?? 0;
  const awaiting = stats?.awaitingPayment ?? 0;

  useEffect(() => {
    if (!ready) return;
    const now: Figures = {
      total: settled,
      seconds,
      awaitingPayment: awaiting,
    };
    /* A timezone change refetches under a new query key, and the arriving
       figures describe a different day boundary. Diffing them against the old
       zone's snapshot would fold a cross-timezone difference into
       `earnedToday` as work that never happened. */
    if (era.current !== zone) {
      era.current = zone;
      last.current = null;
    }
    const why = cause(last.current, now);
    last.current = now;

    setState((current) => {
      const next = fold(
        current ?? opened.current ?? null,
        { date: today(zone), unbilled: settled },
        why,
      );
      write(next);
      return next;
    });
    /* Keyed to the figures, never to `stats`: an effect keyed to the object
       would re-run on every refetch that changed nothing, fold a null cause
       and advance the baseline for no reason — which drops the next real
       stop, because it is then measured from a snapshot of itself. */
  }, [ready, settled, seconds, awaiting, zone]);

  const beat = useBeat(settled, seconds, awaiting, zone);

  /* A first-ever load has no stored yesterday, so there is no period to name
     and "since yesterday" over the user's whole history would be untrue.
     Earnings are not suppressed the same way: `earnedToday` only ever counts
     stops this browser WATCHED arrive, so it is a fact about what just
     happened rather than a claim about a period, and a stop on a fresh
     browser must still say what it was worth. */
  const first = opened.current == null;

  return {
    /** Today's earnings so far — stops observed since this browser opened. */
    earnedToday: state ? state.earnedToday : null,
    /** Unbilled's movement since yesterday closed, or null on a first load. */
    sinceOpen: state && !first ? settled - state.openedUnbilled : null,
    /** The last classified event, retiring on its own timer. One per panel:
     *  two callers each held their own timer and could disagree. */
    beat,
  };
}
