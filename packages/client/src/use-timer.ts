'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { TimerApi } from './api.ts';
import { useOptimisticMutation } from './mutations.ts';
import { readTimer, summaryQuery, timerPresses } from './timer-presses.ts';

/**
 * The zone the device is in now. "Today" is a local question the server
 * cannot infer, and the answer moves with a traveling phone, so each app
 * decides when to ask again and passes it to `useTimer`.
 */
export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * A second-resolution clock, shared by everything that counts up.
 *
 * One interval for the whole page rather than one per component, and it
 * ticks only while a timer is running — an idle page does no work.
 *
 * Returns false until after hydration. A clock read during SSR and again on
 * the client lands on different seconds, which React reports as a hydration
 * mismatch; deferring the first tick keeps the two renders identical.
 */
function useTick(active: boolean): boolean {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  return hydrated;
}

/**
 * Timer state.
 *
 * The server owns whether a timer is running; the display counts locally
 * from `startedAt` so it is smooth and works without the network, and
 * reconciles on an interval and on **every** window focus — the menu bar app
 * starts timers this tab never hears about.
 *
 * `serverTime` from the response corrects for a skewed device clock — a
 * laptop several minutes off would otherwise show a wrong elapsed time.
 */
export function useTimer(api: TimerApi, timeZone: string) {
  const queryClient = useQueryClient();
  const summary = useQuery(summaryQuery(api, timeZone));

  const running = summary.data?.running ?? null;
  const hydrated = useTick(Boolean(running));

  // Before hydration, count from the server's own timestamp so the server
  // and client first renders produce identical text. After that, the live
  // clock takes over.
  const reading = readTimer(summary.data, summary.dataUpdatedAt, !hydrated);
  const { liveSeconds, todaySeconds } = reading;
  const presses = timerPresses(api, timeZone, queryClient, reading);
  const start = useOptimisticMutation(presses.start);
  const stop = useOptimisticMutation(presses.stop);
  const update = useOptimisticMutation(presses.update);

  return {
    running,
    seconds: liveSeconds,
    todaySeconds,
    weekSeconds: summary.data?.weekSeconds ?? 0,
    isLoading: summary.isLoading,
    isPending: summary.isPending,
    error: summary.error,
    start,
    stop,
    update,
  };
}
