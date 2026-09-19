'use client';

import { useEffect, useRef, useState } from 'react';
import { localDateKey } from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import type { Stats } from '@/lib/client/api';

/**
 * What just happened, read off two consecutive `/stats` responses.
 *
 * Irreducibly client-side: a beat is the difference between what this screen
 * showed a moment ago and what it shows now, which no query can answer. The
 * figures themselves are the server's — only the transition is held here, in
 * memory, for as long as it is worth reporting.
 */

/**
 * Why the figures moved, read off the figures themselves.
 *
 * The beats are reactions to mutations that happen on other screens — the
 * timer bar, the inbox, an invoice — and a region that subscribed to each of
 * them would be a region that knows about all of them. `/stats` is already
 * invalidated by every one, so the refetch carries the news.
 *
 * Three axes, because one refetch can carry more than one event and a single
 * net figure cannot tell them apart. Each event owns the axis no other event
 * moves in its direction:
 *
 * | Event | Axis | Direction |
 * | --- | --- | --- |
 * | `stop` | `seconds` | rises |
 * | `sent` | `awaitingPayment` | rises |
 * | `paid` | `collected` | rises |
 *
 * Hours are the only evidence a timer stopped: money alone also moves when a
 * rate is edited elsewhere. Sending and paying BOTH move `awaitingPayment` —
 * a send raises it, a payment lowers it — so that axis alone cannot name
 * which happened, and `collected` is what separates them.
 *
 * More than one at once resolves to null. The delta each would report is the
 * others' movement mixed in, and a figure that is the net of two unrelated
 * events is money the app would be inventing.
 */
/**
 * The figures a classification is read from.
 *
 * Scalars rather than the `Stats` object: React Query returns a new object
 * whenever ANY field changes, so a caller holding the object in a ref or a
 * dependency list reacts to changes that carry no event.
 */
export type Figures = {
  total: number;
  seconds: number;
  awaitingPayment: number;
  collected: number;
};

export const figuresOf = (s: Stats): Figures => ({
  total: s.unbilled.total,
  seconds: s.unbilled.seconds,
  awaitingPayment: s.awaitingPayment,
  collected: s.collected.trailing12,
});

export function cause(
  prev: Figures | null,
  next: Figures,
): 'stop' | 'sent' | 'paid' | null {
  if (!prev) return null;
  const stopped = next.seconds > prev.seconds;
  const paid = next.collected > prev.collected;
  /* A send is a rise in what is awaiting with `collected` HELD. Testing the
     rise alone misreads the case where one invoice is paid while a larger one
     is raised in the same refetch — both axes move, and the send would win on
     an axis the payment also touches. */
  const sent = next.awaitingPayment > prev.awaitingPayment && !paid;

  if ([stopped, sent, paid].filter(Boolean).length !== 1) return null;
  return stopped ? 'stop' : sent ? 'sent' : 'paid';
}

export type Beat = {
  kind: 'stop' | 'sent' | 'paid';
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
  kind: 'stop' | 'sent' | 'paid',
  amount: number,
  before: number,
  after: number,
): boolean | null {
  /* Money that reached an invoice was billable by definition — both of these
     kinds describe an invoice, not a stop. */
  if (kind !== 'stop') return true;
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
  collected: number,
  epoch: string,
): Beat {
  const prev = useRef<Figures | null>(null);
  const era = useRef(epoch);
  const [beat, setBeat] = useState<Beat>(null);

  useEffect(() => {
    const next = { total, seconds, awaitingPayment, collected };
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

    /* Each kind takes its amount from the axis its OWN event moves. A payment
       reads `collected` rather than the fall in what is awaiting: the two
       agree only when nothing else was invoiced in the same refetch, and the
       collected axis is the one the event is defined by. */
    const amount =
      kind === 'paid'
        ? collected - before.collected
        : kind === 'sent'
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
  }, [total, seconds, awaitingPayment, collected, epoch]);

  return beat;
}

/**
 * The last thing that happened, for as long as it is worth saying.
 *
 * @param zone The timezone the `/stats` query is keyed by. It is part of the
 *   cache key, so a change refetches as a NEW query whose figures describe a
 *   different day boundary — the refs holding the previous arrival must be
 *   dropped with it, or the difference between two timezones is reported as a
 *   stop. Defaults to this browser's zone, which is what the app passes.
 */
export function useBeatOf(stats: Stats | null | undefined, zone: string = tz) {
  return useBeat(
    stats?.unbilled.total ?? 0,
    stats?.unbilled.seconds ?? 0,
    stats?.awaitingPayment ?? 0,
    stats?.collected.trailing12 ?? 0,
    zone,
  );
}
