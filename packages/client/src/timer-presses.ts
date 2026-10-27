import type { QueryClient } from '@tanstack/react-query';
import { elapsedSeconds, entrySeconds, localDateKey } from '@stint/core';
import type {
  Include,
  IncludedName,
  StartTimer,
  Stats,
  Summary,
  TimeEntry,
  TimerApi,
} from './api.ts';
import type { OptimisticOptions } from './mutations.ts';
import { invalidateEntryData, keys } from './query-keys.ts';

/**
 * The timer's reads and presses as plain options, so a screen's hook
 * (`useTimer`) and a press with no screen (`pressOnce`, a phone's widget)
 * share one lane and one set of predictions.
 */

/** The running timer, read with its clock: how a press's prediction counts. */
export interface TimerReading {
  running: TimeEntry | null;
  /** The server's clock minus this device's, at the last fetch. */
  skewMs: number;
  liveSeconds: number;
  todaySeconds: number;
}

/**
 * `data` as of now. `atServerTime` counts at the server's own timestamp, as
 * a first render does so the server's and the client's text agree.
 */
export function readTimer(
  data: Summary | undefined,
  dataUpdatedAt: number,
  atServerTime = false,
): TimerReading {
  const running = data?.running ?? null;
  const skewMs = data ? new Date(data.serverTime).getTime() - dataUpdatedAt : 0;
  const now =
    !atServerTime || !data
      ? new Date(Date.now() + skewMs)
      : new Date(data.serverTime);
  // Totals include the running timer, so both menu-bar-style displays agree.
  const liveSeconds = running ? elapsedSeconds(running.startedAt, now) : 0;
  const baseToday = (data?.todaySeconds ?? 0) - (data ? liveAtFetch(data) : 0);
  return {
    running,
    skewMs,
    liveSeconds,
    todaySeconds: Math.max(0, baseToday + liveSeconds),
  };
}

/** The timer's read, which every timer screen and surface shares. */
export function summaryQuery(api: Pick<TimerApi, 'summary'>, timeZone: string) {
  return {
    queryKey: keys.summary(timeZone),
    queryFn: () => api.summary(timeZone),
    // A running timer is reconciled every 10s, so a stop on another device
    // shows soon. React Query skips the interval while the tab is hidden.
    refetchInterval: (q: { state: { data?: Summary } }) =>
      q.state.data?.running ? 10_000 : false,
    /* `true` would still be gated on staleness, and the default `staleTime`
       is 10s — so starting a timer in the menu bar and tabbing straight back
       showed a stopped bar, while returning slowly worked. Whether the tab
       sees the timer cannot depend on how long the user took to switch.
       `'always'` is the only value that skips the staleness check. */
    refetchOnWindowFocus: 'always' as const,
    /* The timer is the one thing on the page that is wrong rather than
       merely old when it is stale: it says stopped while time is accruing.
       Nothing else here overrides the shared 10s. */
    staleTime: 0,
  };
}

/** Start, Stop and a running edit, each predicted from `reading`. */
export function timerPresses(
  api: TimerApi,
  timeZone: string,
  queryClient: QueryClient,
  reading: TimerReading,
) {
  /* Every timer press changes the summary: its prediction shows at once,
     with today's total frozen at its live value so the readout neither
     jumps nor double counts. The refetch that follows replaces all of it,
     the server's own `startedAt` included. */
  const serverNow = () => new Date(Date.now() + reading.skewMs).toISOString();
  const showing = (
    current: Summary | undefined,
    running: TimeEntry | null,
  ): Summary | undefined =>
    current && {
      ...current,
      running,
      todaySeconds: reading.todaySeconds,
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
  const start: OptimisticOptions<StartVars, unknown, Summary> = {
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
  };
  const started = (body: StartVars): TimeEntry => ({
    id: body.id,
    taskName: body.taskName,
    projectId: body.projectId ?? null,
    startedAt: serverNow(),
    endedAt: null,
    isBillable: body.isBillable ?? true,
    durationSeconds: null,
    durationOk: false,
    invoicedElsewhere: false,
    rateOverride: null,
    invoiceId: null,
  });
  /* The running row in every cached list finishes where the readout
     stopped, and today's bar takes the time since `/stats` measured it, at
     most the running entry's own, so
     Today's and the week's hours move with the bar. */
  const stop: OptimisticOptions<void, unknown, Summary> = {
    ...settles,
    mutationFn: () => api.stopTimer(HOME),
    predict: (current) => showing(current, null),
    alsoPredict: [
      {
        queryKey: keys.entries(),
        predict: (current) =>
          reading.running
            ? withEntries(current, (rows) =>
                rows.map((e) =>
                  e.id === reading.running?.id
                    ? {
                        ...e,
                        endedAt: serverNow(),
                        durationSeconds: reading.liveSeconds,
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
          return reading.running && fetchedAt
            ? withTodayBar(
                current as Stats | undefined,
                Math.min(sinceSeconds(fetchedAt), reading.liveSeconds),
                timeZone,
              )
            : current;
        },
      },
    ],
  };
  const sinceSeconds = (at: number) =>
    Math.max(0, Math.floor((Date.now() - at) / 1000));

  const update: OptimisticOptions<
    { taskName?: string; projectId?: string | null },
    TimeEntry,
    Summary
  > = {
    ...timerPress,
    mutationFn: (body) => api.updateRunning(body),
    predict: (current, body) =>
      current?.running
        ? showing(current, { ...current.running, ...body })
        : current,
  };

  return { start, stop, update };
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

export type StartVars = StartTimer & { id: string };

/**
 * How much of the fetched `todaySeconds` was the running timer at fetch
 * time — subtracted so the live count replaces it rather than doubling it.
 */
function liveAtFetch(data: Summary): number {
  if (!data.running) return 0;
  return entrySeconds(data.running.startedAt, new Date(data.serverTime));
}
