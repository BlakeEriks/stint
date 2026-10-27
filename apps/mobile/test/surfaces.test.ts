import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, type Summary, type TimeEntry } from '@stint/client';
import { QueryClient } from '@tanstack/react-query';
import { createSurfaces, type SurfaceState } from '../src/surfaces.ts';

const TZ = 'UTC';
const project = {
  id: 'p1',
  clientId: 'c1',
  name: 'Warehouse dashboard',
  archivedAt: null,
};
const client = { id: 'c1', name: 'Northwind Trading', color: '#5B8DEF' };

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'e1',
  taskName: 'Checkout timeout fix',
  projectId: 'p1',
  startedAt: '2026-10-27T09:00:00.000Z',
  endedAt: null,
  isBillable: true,
  durationSeconds: null,
  durationOk: false,
  rateOverride: null,
  invoiceId: null,
  ...over,
});
const summary = (running: TimeEntry | null): Summary =>
  ({
    running,
    todaySeconds: 0,
    weekSeconds: 0,
    serverTime: new Date().toISOString(),
  }) as unknown as Summary;

/** A server holding `running`, whose presses wait for `answer()` when held. */
function server(running: TimeEntry | null) {
  const calls: string[] = [];
  let hold: Promise<void> | null = null;
  let release = () => {};
  let fail: Error | null = null;
  const api = {
    summary: async () => summary(running),
    taskNames: async () => ({
      taskNames: [{ taskName: 'Filter panel', projectId: 'p1' }],
    }),
    projects: async () => ({ projects: [project] }),
    clients: async () => ({ clients: [client] }),
    startTimer: async (body: { id: string; taskName: string }) => {
      calls.push(`start ${body.taskName}`);
      await hold;
      if (fail) throw fail;
      running = entry({ id: body.id, taskName: body.taskName });
      return { entry: running, included: { summary: summary(running) } };
    },
    stopTimer: async () => {
      calls.push('stop');
      await hold;
      if (fail) throw fail;
      const stopped = { ...(running as TimeEntry), endedAt: 'now' };
      running = null;
      return { entry: stopped, included: { summary: summary(null) } };
    },
  };
  return {
    api: api as never,
    calls,
    holdPresses: () => {
      hold = new Promise((r) => {
        release = r;
      });
    },
    answer: () => release(),
    failWith: (e: Error) => {
      fail = e;
    },
  };
}

function setup(running: TimeEntry | null, signedIn = true) {
  const s = server(running);
  const drawn: SurfaceState[] = [];
  const queryClient = new QueryClient();
  const surfaces = createSurfaces({
    queryClient,
    api: s.api,
    timeZone: () => TZ,
    signedIn: async () => signedIn,
    draw: (state) => drawn.push(state),
  });
  surfaces.follow();
  const last = () => drawn.at(-1);
  return { ...s, queryClient, surfaces, drawn, last };
}

test('a running timer draws its task, project and client, and its start', async () => {
  const { surfaces, last } = setup(entry());
  await surfaces.refresh();
  const s = last();
  assert.ok(s?.kind === 'running');
  const { startedAt, ...rest } = s;
  assert.deepEqual(rest, {
    kind: 'running',
    title: 'Checkout timeout fix',
    detail: 'Warehouse dashboard · Northwind Trading',
    color: '#5B8DEF',
    why: null,
    tile: 'Checkout timeout fix',
    shortcut: 'Stop',
  });
  // In the phone's clock: within a second of the server's start.
  assert.ok(Math.abs(s.startedAt - Date.parse(entry().startedAt)) < 1000);
});

test('stopped, Start offers the most recent task on its project', async () => {
  const { surfaces, last } = setup(null);
  await surfaces.refresh();
  assert.deepEqual(last(), {
    kind: 'stopped',
    title: 'Filter panel',
    detail: 'Warehouse dashboard',
    color: '#5B8DEF',
    next: { taskName: 'Filter panel', projectId: 'p1' },
    why: null,
    tile: 'Start: Filter panel',
    shortcut: 'Start: Filter panel',
  });
});

test('on the first day, Start begins an unnamed timer on no project', async () => {
  const { surfaces, last, api } = setup(null);
  (api as { taskNames: unknown }).taskNames = async () => ({ taskNames: [] });
  await surfaces.refresh();
  assert.deepEqual(last(), {
    kind: 'stopped',
    title: 'Start a timer',
    detail: 'Name it in the app later',
    color: null,
    next: { taskName: '', projectId: null },
    why: null,
    tile: 'Start: a timer',
    shortcut: 'Start: a timer',
  });
});

test('signed out draws the sign-in state and fetches nothing', async () => {
  const { surfaces, last, calls } = setup(entry(), false);
  await surfaces.refresh();
  assert.deepEqual(last(), {
    kind: 'signedOut',
    title: 'Sign in to Stint',
    detail: 'Tap to open the app',
    why: null,
    tile: 'Sign in',
    shortcut: null,
  });
  assert.deepEqual(calls, []);
});

test('a stop draws stopped at once, then what the server holds', async () => {
  const { surfaces, last, holdPresses, answer } = setup(entry());
  await surfaces.refresh();
  holdPresses();
  const press = surfaces.press({ action: 'stop' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(last()?.kind, 'stopped');
  answer();
  await press;
  assert.equal(last()?.kind, 'stopped');
  assert.equal(last()?.why, null);
});

test('a start sends what the surface showed', async () => {
  const { surfaces, calls, last } = setup(null);
  await surfaces.press({
    action: 'start',
    taskName: 'Filter panel',
    projectId: 'p1',
  });
  assert.deepEqual(calls, ['start Filter panel']);
  assert.equal(last()?.kind, 'running');
});

test('a refused stop draws what the server holds, with the reason', async () => {
  const { surfaces, last, failWith } = setup(entry());
  await surfaces.refresh();
  failWith(
    new ApiError(409, { code: 'NO_TIMER_RUNNING', message: 'No timer.' }),
  );
  await surfaces.press({ action: 'stop' });
  assert.equal(last()?.kind, 'running');
  assert.equal(last()?.why, 'Not stopped: No timer');
});

test('a press that fails with nothing cached keeps the drawn state, with the reason', async () => {
  const { surfaces, last, failWith, api } = setup(entry());
  failWith(new TypeError('Network request failed'));
  (api as { summary: unknown }).summary = async () => {
    throw new TypeError('Network request failed');
  };
  await surfaces.press({ action: 'stop' });
  assert.deepEqual(last(), {
    kind: 'kept',
    why: 'Not stopped: can’t reach Stint',
  });
});

test('the next press clears the reason', async () => {
  const { surfaces, last, failWith } = setup(entry());
  await surfaces.refresh();
  failWith(new ApiError(500, { code: 'INTERNAL', message: 'Broke.' }));
  await surfaces.press({ action: 'stop' });
  failWith(null as never);
  await surfaces.press({ action: 'stop' });
  assert.equal(last()?.why, null);
});

test('presses reach the server in press order', async () => {
  const { surfaces, calls, holdPresses, answer } = setup(null);
  await surfaces.refresh();
  holdPresses();
  const start = surfaces.press({
    action: 'start',
    taskName: 'A',
    projectId: null,
  });
  const stop = surfaces.press({ action: 'stop' });
  await new Promise((r) => setTimeout(r, 0));
  // The stop waits in the lane until the start is answered.
  assert.deepEqual(calls, ['start A']);
  answer();
  await Promise.all([start, stop]);
  assert.deepEqual(calls, ['start A', 'stop']);
});

test('a push refetches and draws, unless a press is in flight', async () => {
  const { surfaces, drawn, holdPresses, answer } = setup(entry());
  await surfaces.refresh();
  holdPresses();
  const press = surfaces.press({ action: 'stop' });
  const before = drawn.length;
  await surfaces.refresh();
  assert.equal(drawn.length, before);
  answer();
  await press;
});

test('an unchanged state is not drawn twice', async () => {
  const { surfaces, drawn } = setup(entry());
  await surfaces.refresh();
  const n = drawn.length;
  await surfaces.refresh();
  assert.equal(drawn.length, n);
});
