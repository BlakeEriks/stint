'use client';

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  Include,
  IncludedName,
  StartTimer,
  Stats,
  Summary,
  TimeEntry,
  TimerApi,
} from './api.ts';
import { elapsedSeconds, entrySeconds, localDateKey } from '@stint/core';
import { keys, invalidateEntryData } from './query-keys.ts';
import { useOptimisticMutation } from './mutations.ts';

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
  const summary = useQuery({
    queryKey: keys.summary(timeZone),
    queryFn: () => api.summary(timeZone),
    // A running timer is reconciled every 10s, so a stop on another device
    // shows soon. React Query skips the interval while the tab is hidden.
    refetchInterval: (q) => (q.state.data?.running ? 10_000 : false),
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
    queryKey: () => keys.summary(timeZone),
    invalidate: (
      qc: QueryClient,
      _vars: unknown,
      settled: readonly IncludedName[],
    ) => invalidateEntryData(qc, settled),
    serial: 'timer',
    movesHome: true,
  };
  /** What a start or stop asks back: the bar's summary and Home's figures. */
  const HOME: Include = { names: ['summary', 'stats'], tz: timeZone };
  const settles = { ...timerPress, include: HOME };

  /* `id` comes from the caller so the prediction and the row the server
     writes are the same entry. */
  const start = useOptimisticMutation<StartVars, unknown, Summary>({
    ...settles,
    mutationFn: (body) => api.startTimer(body, HOME),
    predict: (current, body) => showing(current, started(body)),
    // Today's list shows the new row at once, as the bar does.
    alsoPredict: [
      {
        queryKey: keys.entries(),
        predict: (current, body, key) =>
          inWindow(key, serverNow())
            ? withEntries(current, (rows) => [started(body), ...rows])
            : current,
      },
    ],
  });
  const started = (body: StartVars): TimeEntry => ({
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
  });
  /* The running row in every cached list finishes where the readout
     stopped, and today's bar takes the time since `/stats` measured it, at
     most the running entry's own, so
     Today's and the week's hours move with the bar. */
  const stop = useOptimisticMutation<void, unknown, Summary>({
    ...settles,
    mutationFn: () => api.stopTimer(HOME),
    predict: (current) => showing(current, null),
    alsoPredict: [
      {
        queryKey: keys.entries(),
        predict: (current) =>
          running
            ? withEntries(current, (rows) =>
                rows.map((e) =>
                  e.id === running.id
                    ? {
                        ...e,
                        endedAt: serverNow(),
                        durationSeconds: liveSeconds,
                      }
                    : e,
                ),
              )
            : current,
      },
      {
        queryKey: keys.stats(timeZone),
        predict: (current, _vars, key) => {
          const fetchedAt = queryClient.getQueryState(key)?.dataUpdatedAt;
          return running && fetchedAt
            ? withTodayBar(
                current as Stats | undefined,
                Math.min(sinceSeconds(fetchedAt), liveSeconds),
                timeZone,
              )
            : current;
        },
      },
    ],
  });
  const sinceSeconds = (at: number) =>
    Math.max(0, Math.floor((Date.now() - at) / 1000));

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
    isPending: summary.isPending,
    error: summary.error,
    start,
    stop,
    update,
  };
}

/**
 * A cached `/entries` list with `change` applied to its rows. A single
 * entry, cached under the same prefix, is left alone.
 */
function withEntries(
  current: unknown,
  change: (rows: TimeEntry[]) => TimeEntry[],
): unknown {
  const list = current as { entries?: TimeEntry[] } | undefined;
  return Array.isArray(list?.entries)
    ? { ...list, entries: change(list.entries) }
    : current;
}

/** `stats` with `seconds` more on today's bar, today being in `tz`. */
function withTodayBar(stats: Stats | undefined, seconds: number, tz: string) {
  if (!stats || seconds === 0) return stats;
  const today = localDateKey(new Date(), tz);
  return {
    ...stats,
    week: stats.week.map((d) =>
      d.date === today ? { ...d, seconds: d.seconds + seconds } : d,
    ),
  };
}

/** Whether a cached list's `from`–`to` window holds the instant `at`. */
function inWindow(key: readonly unknown[], at: string): boolean {
  const window = key[1] as { from?: string; to?: string } | undefined;
  if (typeof window !== 'object' || !window?.from) return false;
  return window.from <= at && (!window.to || at <= window.to);
}

type StartVars = StartTimer & { id: string };

/**
 * How much of the fetched `todaySeconds` was the running timer at fetch
 * time — subtracted so the live count replaces it rather than doubling it.
 */
function liveAtFetch(data: Summary): number {
  if (!data.running) return 0;
  return entrySeconds(data.running.startedAt, new Date(data.serverTime));
}
