'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, type Summary, type TimeEntry } from './api';
import { elapsedSeconds, entrySeconds } from '@stint/core';
import { keys, invalidateEntryData } from './query-keys';
import { useOptimisticMutation } from './mutations';

/**
 * The zone this render is happening in. "Today" is a local question the
 * server cannot infer.
 *
 * Read once at module load: it cannot change while the page is open.
 *
 * Resolved the same way on both sides deliberately — timestamps reach the
 * markup formatted in this zone, so the prerender is in the deploy region's
 * zone and the browser corrects it on hydration.
 */
export const timeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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
export function useTimer() {
  const summary = useQuery({
    queryKey: keys.summary(),
    queryFn: () => api.summary(timeZone),
    // A running timer is reconciled every 60s; the local tick covers the
    // seconds in between.
    refetchInterval: (q) => (q.state.data?.running ? 60_000 : false),
    /* `true` would still be gated on staleness, and the default `staleTime`
       is 10s — so starting a timer in the menu bar and tabbing straight back
       showed a stopped bar, while returning slowly worked. Whether the tab
       sees the timer cannot depend on how long the user took to switch.
       `'always'` is the only value that skips the staleness check. */
    refetchOnWindowFocus: 'always',
    /* The timer is the one thing on the page that is wrong rather than
       merely old when it is stale: it says stopped while time is accruing.
       Nothing else here overrides the shared 10s. */
    staleTime: 0,
  });

  const running = summary.data?.running ?? null;
  const hydrated = useTick(Boolean(running));

  // Difference between the server's clock and this device's, measured at
  // the last fetch. Applied to every elapsed calculation.
  const skewMs = summary.data
    ? new Date(summary.data.serverTime).getTime() - summary.dataUpdatedAt
    : 0;

  // Before hydration, count from the server's own timestamp so the server
  // and client first renders produce identical text. After that, the live
  // clock takes over.
  const now =
    hydrated || !summary.data
      ? new Date(Date.now() + skewMs)
      : new Date(summary.data.serverTime);

  // Totals include the running timer, so both menu-bar-style displays agree.
  const liveSeconds = running ? elapsedSeconds(running.startedAt, now) : 0;
  const baseToday =
    (summary.data?.todaySeconds ?? 0) -
    (summary.data ? liveAtFetch(summary.data) : 0);
  const todaySeconds = Math.max(0, baseToday + liveSeconds);

  /* Every timer press changes the summary: its prediction shows at once,
     with today's total frozen at its live value so the readout neither
     jumps nor double counts. The refetch that follows replaces all of it,
     the server's own `startedAt` included. */
  const serverNow = () => new Date(Date.now() + skewMs).toISOString();
  const showing = (
    current: Summary | undefined,
    running: TimeEntry | null,
  ): Summary | undefined =>
    current && {
      ...current,
      running,
      todaySeconds,
      serverTime: serverNow(),
    };
  // One lane: Start then Stop must reach the server in that order.
  const timerPress = {
    queryKey: () => keys.summary(),
    invalidate: invalidateEntryData,
    serial: 'timer',
  };

  /* `id` comes from the caller so the prediction and the row the server
     writes are the same entry.

     A start while a timer runs is refused here, with the 409's own words,
     rather than predicted and taken back: a Today row can be pressed while
     the timer bar counts, and a press that only flickers reads as broken.
     Whether one runs is read at the press and carried with it, because the
     press's own prediction re-renders this hook before its request is made. */
  const startPress = useOptimisticMutation<
    StartVars & { whileRunning: boolean },
    TimeEntry,
    Summary
  >({
    ...timerPress,
    mutationFn: ({ whileRunning, ...body }) =>
      whileRunning
        ? Promise.reject(
            new ApiError(409, {
              code: 'TIMER_ALREADY_RUNNING',
              message:
                'A timer is already running. Stop it before starting another.',
            }),
          )
        : api.startTimer(body),
    predict: (current, body) =>
      body.whileRunning
        ? current
        : showing(current, {
            id: body.id,
            taskName: body.taskName,
            projectId: body.projectId ?? null,
            startedAt: serverNow(),
            endedAt: null,
            isBillable: body.isBillable ?? true,
            durationSeconds: null,
            durationOk: false,
            rateOverride: null,
            invoiceId: null,
          }),
  });
  const start = {
    ...startPress,
    mutate: (
      vars: StartVars,
      options?: Parameters<typeof startPress.mutate>[1],
    ) =>
      startPress.mutate({ ...vars, whileRunning: running !== null }, options),
  };

  const stop = useOptimisticMutation<void, unknown, Summary>({
    ...timerPress,
    mutationFn: () => api.stopTimer(),
    predict: (current) => showing(current, null),
  });

  const update = useOptimisticMutation<
    { taskName?: string; projectId?: string | null },
    TimeEntry,
    Summary
  >({
    ...timerPress,
    mutationFn: (body) => api.updateRunning(body),
    predict: (current, body) =>
      current?.running
        ? showing(current, { ...current.running, ...body })
        : current,
  });

  return {
    running,
    seconds: liveSeconds,
    todaySeconds,
    weekSeconds: summary.data?.weekSeconds ?? 0,
    isLoading: summary.isLoading,
    error: summary.error,
    start,
    stop,
    update,
  };
}

interface StartVars {
  id: string;
  taskName: string;
  projectId?: string | null;
  isBillable?: boolean;
}

/**
 * How much of the fetched `todaySeconds` was the running timer at fetch
 * time — subtracted so the live count replaces it rather than doubling it.
 */
function liveAtFetch(data: Summary): number {
  if (!data.running) return 0;
  return entrySeconds(data.running.startedAt, new Date(data.serverTime));
}
