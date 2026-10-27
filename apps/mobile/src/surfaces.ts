import {
  ApiError,
  invalidateEntryData,
  keys,
  pressOnce,
  type Include,
  type IncludedName,
  type Summary,
  type TimeEntry,
} from '@stint/client';
import { uuidv7 } from '@stint/core';
import type { QueryClient } from '@tanstack/react-query';
import type { Api } from './api.ts';
import { projectLookup, recentTasks } from './screen-state.ts';

/**
 * The timer outside the app: the notification, widgets, tile and shortcut
 * (`docs/mobile.md`, Outside the app). JS decides what they show and Kotlin
 * draws it (`modules/stint-surfaces`), so the press below is the app's own:
 * the same `QueryClient`, lane and 10s bound as a Stop in the app.
 */

export interface Next {
  taskName: string;
  projectId: string | null;
}

/** Every surface's words, so Kotlin decides nothing. */
interface Lines {
  title: string;
  detail: string | null;
  /** The last press's failure, until the next press. */
  why: string | null;
  tile: string;
  /** `null`: no shortcut. */
  shortcut: string | null;
}

export type SurfaceState =
  | (Lines & {
      kind: 'running';
      color: string | null;
      /** When it started, in the phone's clock (ms). */
      startedAt: number;
    })
  | (Lines & { kind: 'stopped'; color: string | null; next: Next })
  | (Lines & { kind: 'signedOut' })
  /** The server can't be asked: the drawn state stays, with `why`. */
  | { kind: 'kept'; why: string };

export interface Press {
  action: 'start' | 'stop';
  /** What the surface showed Start would begin. */
  taskName?: string;
  projectId?: string | null;
}

interface Options {
  queryClient: QueryClient;
  api: Pick<
    Api,
    | 'summary'
    | 'taskNames'
    | 'projects'
    | 'clients'
    | 'startTimer'
    | 'stopTimer'
  >;
  timeZone: () => string;
  signedIn: () => Promise<boolean>;
  draw: (state: SurfaceState) => void;
}

const SIGNED_OUT: SurfaceState = {
  kind: 'signedOut',
  title: 'Sign in to Stint',
  detail: 'Tap to open the app',
  why: null,
  tile: 'Sign in',
  shortcut: null,
};

export function createSurfaces({
  queryClient,
  api,
  timeZone,
  signedIn,
  draw,
}: Options) {
  let why: string | null = null;
  let drawn = '';

  const show = (state: SurfaceState) => {
    const json = JSON.stringify(state);
    if (json === drawn) return;
    drawn = json;
    draw(state);
  };

  const reads = () => ({
    summary: {
      queryKey: keys.summary(timeZone()),
      queryFn: () => api.summary(timeZone()),
    },
    taskNames: {
      queryKey: keys.taskNames({}),
      queryFn: () => api.taskNames(1).then((r) => r.taskNames),
    },
    projects: {
      queryKey: keys.projects({ archived: true }),
      queryFn: () => api.projects().then((r) => r.projects),
    },
    clients: {
      queryKey: keys.clients({ archived: true }),
      queryFn: () => api.clients().then((r) => r.clients),
    },
  });

  /** What the cache holds, drawn; nothing until the timer has been read. */
  function render() {
    const r = reads();
    const data = queryClient.getQueryData<Summary>(r.summary.queryKey);
    if (!data) return false;
    const at =
      queryClient.getQueryState(r.summary.queryKey)?.dataUpdatedAt ??
      Date.now();
    const lookup = projectLookup(
      queryClient.getQueryData(r.projects.queryKey) ?? [],
      queryClient.getQueryData(r.clients.queryKey) ?? [],
    );
    const names = queryClient.getQueryData(r.taskNames.queryKey) ?? [];
    show(
      stateOf(data, at, recentTasks(names as never, null, lookup)[0], lookup),
    );
    return true;
  }

  function stateOf(
    data: Summary,
    fetchedAt: number,
    recent: ReturnType<typeof recentTasks>[number] | undefined,
    lookup: ReturnType<typeof projectLookup>,
  ): SurfaceState {
    const running = data.running;
    if (running) {
      const shown = running.projectId ? lookup(running.projectId) : undefined;
      const skew = Date.parse(data.serverTime) - fetchedAt;
      const title = running.taskName || 'Untitled';
      return {
        kind: 'running',
        title,
        detail: shown
          ? [shown.name, shown.clientName].filter(Boolean).join(' · ')
          : null,
        color: shown?.color ?? null,
        startedAt: Date.parse(running.startedAt) - skew,
        why,
        tile: title,
        shortcut: 'Stop',
      };
    }
    if (!recent) {
      return {
        kind: 'stopped',
        title: 'Start a timer',
        detail: 'Name it in the app later',
        color: null,
        next: { taskName: '', projectId: null },
        why,
        tile: 'Start: a timer',
        shortcut: 'Start: a timer',
      };
    }
    const title = recent.taskName || 'Untitled';
    return {
      kind: 'stopped',
      title,
      detail: recent.projectName,
      color: recent.color,
      next: { taskName: recent.taskName, projectId: recent.projectId },
      why,
      tile: `Start: ${title}`,
      shortcut: `Start: ${title}`,
    };
  }

  /**
   * Reads the timer and draws it: on a push, a sign-in and after a press.
   * A press in flight skips it, as `onTimerPush` does, since a read landing
   * before the server has the press would draw the old timer.
   */
  async function refresh() {
    if (!(await signedIn())) {
      show(SIGNED_OUT);
      return;
    }
    if (queryClient.isMutating() > 0) return;
    const r = reads();
    await Promise.all([
      queryClient.fetchQuery({ ...r.summary, staleTime: 0 }),
      queryClient.fetchQuery({ ...r.taskNames, staleTime: 0 }),
      queryClient.ensureQueryData(r.projects),
      queryClient.ensureQueryData(r.clients),
    ]);
    render();
  }

  /** A press from a surface. Its prediction is already drawn natively. */
  async function press(p: Press) {
    why = null;
    const tz = timeZone();
    const include: Include = { names: ['summary', 'stats'], tz };
    const lane = {
      queryKey: () => keys.summary(tz),
      include,
      serial: 'timer',
      movesHome: true,
      invalidate: (
        qc: QueryClient,
        _vars: unknown,
        settled: readonly IncludedName[],
      ) => invalidateEntryData(qc, settled),
    };
    try {
      if (p.action === 'stop') {
        await pressOnce(
          queryClient,
          {
            ...lane,
            mutationFn: () => api.stopTimer(include),
            predict: (current: Summary | undefined) => showing(current, null),
          },
          undefined,
        );
      } else {
        const body = {
          id: uuidv7(),
          taskName: p.taskName ?? '',
          projectId: p.projectId ?? null,
        };
        await pressOnce(
          queryClient,
          {
            ...lane,
            mutationFn: () => api.startTimer(body, include),
            predict: (current: Summary | undefined) =>
              showing(current, started(body)),
          },
          body,
        );
      }
    } catch (err) {
      why = `${p.action === 'stop' ? 'Not stopped' : 'Not started'}: ${reason(err)}`;
    }
    await refresh().catch(offline);
    if (!render() && why) show({ kind: 'kept', why });
  }

  return {
    refresh,
    press,
    /** Draws every change to the cached timer, as the app reads it. */
    follow() {
      return queryClient.getQueryCache().subscribe(() => void render());
    },
    signOut() {
      why = null;
      show(SIGNED_OUT);
    },
  };
}

/** A prediction: the timer as pressed; the answer brings Today's total. */
function showing(current: Summary | undefined, running: TimeEntry | null) {
  return (
    current && { ...current, running, serverTime: new Date().toISOString() }
  );
}

function started(body: Next & { id: string }): TimeEntry {
  return {
    id: body.id,
    taskName: body.taskName,
    projectId: body.projectId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    isBillable: true,
    durationSeconds: null,
    durationOk: false,
    rateOverride: null,
    invoiceId: null,
  };
}

/** A refusal's message; the network, said plainly. Anything else is a bug. */
function reason(err: unknown): string {
  if (err instanceof ApiError) return err.message.replace(/\.$/, '');
  if (err instanceof TypeError) return 'can’t reach Stint';
  throw err;
}

/** The read after a press failing offline: what was drawn stays. */
function offline(err: unknown) {
  if (err instanceof ApiError || err instanceof TypeError) return;
  throw err;
}
