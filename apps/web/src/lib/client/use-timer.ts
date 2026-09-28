'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, type Summary, type TimeEntry } from './api';
import { elapsedSeconds } from '@stint/core';
import { keys, invalidateEntryData } from './query-keys';

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
  const queryClient = useQueryClient();

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

  const invalidate = () => invalidateEntryData(queryClient);

  /* A refetch already in flight was asked before the press, and landing after
     the answer below it would put the old state back. */
  const hold = () => queryClient.cancelQueries({ queryKey: keys.summary() });

  /* Each answer is written into the summary as it arrives, so the bar settles
     after one round trip rather than two — `invalidate` still refetches
     everything, but nothing waits on it. Until then, `phase` below renders
     the press, and a failure takes it back by simply ending. */
  const start = useMutation({
    mutationFn: (body: { taskName: string; projectId?: string | null }) =>
      api.startTimer(body),
    onMutate: hold,
    onSuccess: (entry) => {
      settle(queryClient, entry);
      invalidate();
    },
    onError: (err) => {
      // Another device started one first. Show that one rather than
      // surfacing a failure the user cannot act on.
      if (err instanceof ApiError && err.isTimerConflict) {
        const running = (err.details as { running?: TimeEntry } | undefined)
          ?.running;
        if (running) settle(queryClient, running);
        invalidate();
      }
    },
  });

  const stop = useMutation({
    mutationFn: () => api.stopTimer(),
    onMutate: hold,
    onSuccess: () => {
      settle(queryClient, null);
      invalidate();
    },
    onError: () => invalidate(),
  });

  /* What the bar renders. `starting` and `stopping` exist only while the
     server has not answered, and neither claims a running timer: the accent
     arrives with the server's `startedAt`, never before it. */
  const phase: 'idle' | 'starting' | 'running' | 'stopping' = start.isPending
    ? 'starting'
    : stop.isPending
      ? 'stopping'
      : running
        ? 'running'
        : 'idle';

  const update = useMutation({
    mutationFn: (body: { taskName?: string; projectId?: string | null }) =>
      api.updateRunning(body),
    onMutate: hold,
    onSuccess: (entry) => {
      settle(queryClient, entry);
      invalidate();
    },
  });

  return {
    running,
    phase,
    /** What is being started, while `phase` is `starting`. */
    starting: start.isPending ? start.variables : undefined,
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

/**
 * Puts a timer mutation's answer into the cached summary.
 *
 * `serverTime` moves to now under the same skew, since `useTimer` measures
 * skew against the time the data was written. Today's total is carried at
 * what it reads now, so it neither jumps at the press nor counts a stopped
 * timer twice.
 */
function settle(queryClient: QueryClient, running: TimeEntry | null) {
  const state = queryClient.getQueryState<Summary>(keys.summary());
  const old = state?.data;
  if (!old) return;
  const skew = new Date(old.serverTime).getTime() - state.dataUpdatedAt;
  const serverNow = new Date(Date.now() + skew);
  // Today's finished work; a timer that just stopped is part of it now.
  let finished = old.todaySeconds - liveAtFetch(old);
  if (old.running && !running)
    finished += elapsedSeconds(old.running.startedAt, serverNow);
  queryClient.setQueryData<Summary>(keys.summary(), {
    ...old,
    running,
    serverTime: serverNow.toISOString(),
    // Folded in as `/summary` folds it, which `liveAtFetch` takes back out.
    todaySeconds:
      finished + (running ? elapsedSeconds(running.startedAt, serverNow) : 0),
  });
}

/**
 * How much of the fetched `todaySeconds` was the running timer at fetch
 * time — subtracted so the live count replaces it rather than doubling it.
 */
function liveAtFetch(data: Summary): number {
  if (!data.running) return 0;
  return elapsedSeconds(data.running.startedAt, new Date(data.serverTime));
}
