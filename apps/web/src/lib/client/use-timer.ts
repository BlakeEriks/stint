'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, type Summary } from './api';
import { elapsedSeconds, deriveTimerView } from '@tt/core';

const SUMMARY_KEY = ['summary'] as const;

/** The browser's zone. "Today" is a local question the server can't infer. */
export function useTimeZone() {
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  return tz;
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
 * reconciles on an interval and on window focus.
 *
 * `serverTime` from the response corrects for a skewed device clock — a
 * laptop several minutes off would otherwise show a wrong elapsed time.
 */
export function useTimer() {
  const tz = useTimeZone();
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => api.summary(tz),
    // A running timer is reconciled every 60s; the local tick covers the
    // seconds in between.
    refetchInterval: (q) => (q.state.data?.running ? 60_000 : false),
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

  const view = deriveTimerView(
    running
      ? {
          id: running.id,
          taskName: running.taskName,
          projectId: running.projectId,
          startedAt: running.startedAt,
        }
      : null,
    summary.data?.maxTimerHours ?? 8,
    now,
  );

  // Totals include the running timer, so both menu-bar-style displays agree.
  const liveSeconds = running ? elapsedSeconds(running.startedAt, now) : 0;
  const baseToday = (summary.data?.todaySeconds ?? 0) - (summary.data ? liveAtFetch(summary.data) : 0);
  const todaySeconds = Math.max(0, baseToday + liveSeconds);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: ['entries'] });
  };

  const start = useMutation({
    mutationFn: (body: { taskName: string; projectId?: string | null }) =>
      api.startTimer(body),
    onSuccess: invalidate,
    onError: (err) => {
      // Another device started one first. Reconcile rather than surfacing
      // a failure the user cannot act on.
      if (err instanceof ApiError && err.isTimerConflict) invalidate();
    },
  });

  const stop = useMutation({
    mutationFn: () => api.stopTimer(),
    onSuccess: invalidate,
    onError: () => invalidate(),
  });

  const update = useMutation({
    mutationFn: (body: { taskName?: string; projectId?: string | null }) =>
      api.updateRunning(body),
    onSuccess: invalidate,
  });

  return {
    running,
    state: view.state,
    seconds: view.seconds,
    exceedsThreshold: view.exceedsThreshold,
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
 * How much of the fetched `todaySeconds` was the running timer at fetch
 * time — subtracted so the live count replaces it rather than doubling it.
 */
function liveAtFetch(data: Summary): number {
  if (!data.running) return 0;
  return elapsedSeconds(data.running.startedAt, new Date(data.serverTime));
}
