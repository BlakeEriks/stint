import {
  ApiError,
  keys,
  pressOnce,
  readTimer,
  summaryQuery,
  timerPresses,
  type Summary,
} from '@stint/client';
import { uuidv7 } from '@stint/core';
import type { QueryClient } from '@tanstack/react-query';
import type { Api } from './api.ts';
import { screenReads } from './reads.ts';
import { projectLookup, recentTasks } from './screen-state.ts';

/**
 * The timer outside the app: the notification, widgets, tile and shortcut
 * (`docs/mobile.md`, Outside the app). JS decides what they show and Kotlin
 * draws it (`modules/stint-surfaces`), so the press below is the app's own:
 * the same `QueryClient`, lane and 10s bound as a Stop in the app.
 */

interface Next {
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
      /** What Start begins once it stops: this task again. */
      next: Next;
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
    | 'stats'
    | 'taskNames'
    | 'projects'
    | 'clients'
    | 'startTimer'
    | 'stopTimer'
    | 'updateRunning'
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
  let last: SurfaceState | null = null;

  const show = (state: SurfaceState) => {
    const json = JSON.stringify(state);
    if (json === drawn) return;
    drawn = json;
    last = state;
    draw(state);
  };

  /** The screen's own reads (`reads.ts`), so both keep one shape in the cache. */
  const reads = () => ({
    summary: summaryQuery(api, timeZone()),
    ...screenReads(api, timeZone()),
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
    show(stateOf(data, at, recentTasks(names, null, lookup)[0], lookup));
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
        next: { taskName: running.taskName, projectId: running.projectId },
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
    try {
      await Promise.all([
        queryClient.fetchQuery({ ...r.summary, staleTime: 0 }),
        queryClient.fetchQuery({ ...r.taskNames, staleTime: 0 }),
        queryClient.ensureQueryData(r.projects),
        queryClient.ensureQueryData(r.clients),
      ]);
    } catch (err) {
      // Offline or refused: what is drawn stays until the next push or press.
      offline(err);
      return;
    }
    render();
  }

  /**
   * A press from a surface, through the app's own options (`timerPresses`),
   * read from the cache as it stands now. Its prediction is already drawn
   * natively.
   */
  async function press(p: Press) {
    why = null;
    const tz = timeZone();
    const key = keys.summary(tz);
    const reading = readTimer(
      queryClient.getQueryData<Summary>(key),
      queryClient.getQueryState(key)?.dataUpdatedAt ?? Date.now(),
    );
    const presses = timerPresses(api, tz, queryClient, reading);
    try {
      if (p.action === 'stop') {
        await pressOnce(queryClient, presses.stop, undefined);
      } else {
        await pressOnce(queryClient, presses.start, {
          id: uuidv7(),
          taskName: p.taskName ?? '',
          projectId: p.projectId ?? null,
        });
      }
    } catch (err) {
      why = `${p.action === 'stop' ? 'Not stopped' : 'Not started'}: ${reason(err)}`;
    }
    // Native drops its prediction only on a draw, so this one always lands.
    drawn = '';
    await refresh();
    if (!render() && why) show({ kind: 'kept', why });
  }

  /** A shortcut's press, opened in the app: Start begins what it named. */
  async function pressLink(action: Press['action']) {
    if (!last || last.kind === 'kept') await refresh();
    const shown = last;
    if (!shown || shown.kind === 'signedOut' || shown.kind === 'kept') return;
    await press(action === 'stop' ? { action } : { action, ...shown.next });
  }

  return {
    refresh,
    press,
    pressLink,
    /** Draws every change to the cached timer, as the app reads it. */
    follow() {
      return queryClient.getQueryCache().subscribe(() => void render());
    },
    signOut() {
      why = null;
      show(SIGNED_OUT);
    },
    /** Draws again though nothing changed: a permission was just granted. */
    redraw() {
      drawn = '';
      render();
    },
  };
}

/**
 * What a surface shows the moment it is pressed, before JS runs: Kotlin swaps
 * it in (`Store.kt`), and the next draw replaces it. A predicted start counts
 * from the press.
 */
export function pressedState(s: SurfaceState): SurfaceState | null {
  if (s.kind === 'running') {
    const tile = `Start: ${s.title}`;
    return {
      kind: 'stopped',
      title: s.title,
      detail: s.detail,
      color: s.color,
      next: s.next,
      why: null,
      tile,
      shortcut: tile,
    };
  }
  if (s.kind !== 'stopped') return null;
  const title = s.next.taskName || 'Untitled';
  const onProject = s.next.projectId !== null;
  return {
    kind: 'running',
    title,
    detail: onProject ? s.detail : null,
    color: onProject ? s.color : null,
    startedAt: 0,
    next: s.next,
    why: null,
    tile: title,
    shortcut: 'Stop',
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
