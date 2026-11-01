import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, keys, type Summary, type TimeEntry } from '@stint/client';
import { QueryClient } from '@tanstack/react-query';
import {
  createSurfaces,
  type Press,
  pressedState,
  type SurfaceState,
} from '../src/surfaces.ts';
import { RECENT_FETCHED } from '../src/screen-state.ts';

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
  invoicedElsewhere: false,
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
    /** As many as asked for, the most recent first. */
    taskNames: async (limit: number) => ({
      taskNames: Array.from({ length: limit }, (_, i) => ({
        taskName: i === 0 ? 'Filter panel' : `Older task ${i}`,
        projectId: 'p1',
      })),
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
    failWith: (e: Error | null) => {
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
    next: { taskName: 'Checkout timeout fix', projectId: 'p1' },
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

test('signed out draws the sign-in state, fetches nothing, and has no press', async () => {
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
  assert.equal(pressedState(last() as SurfaceState), null);
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const noTimer = new ApiError(409, {
  code: 'NO_TIMER_RUNNING',
  message: 'No timer.',
});
const unreachable = new TypeError('Network request failed');

/**
 * A press, over (state, press, server answer): what the surface shows when
 * pressed (`pressedState`, drawn natively), what JS draws at once, what
 * reaches the server, and what is drawn once it answers. One press per
 * answer, each held until the draw at once is read.
 */
const pressRows: {
  name: string;
  running: TimeEntry | null;
  /** No task yet: Start offers an unnamed timer. */
  firstDay?: true;
  /** Nothing cached, and the server can't be reached. */
  offline?: true;
  press: Press;
  answers: (Error | null)[];
  pressed?: SurfaceState;
  atOnce?: SurfaceState['kind'];
  calls: string[];
  drawn: Partial<Record<string, unknown>>;
}[] = [
  {
    name: 'a stop shows its own task to start again, then stopped',
    running: entry(),
    press: { action: 'stop' },
    answers: [null],
    pressed: {
      kind: 'stopped',
      title: 'Checkout timeout fix',
      detail: 'Warehouse dashboard · Northwind Trading',
      color: '#5B8DEF',
      next: { taskName: 'Checkout timeout fix', projectId: 'p1' },
      why: null,
      tile: 'Start: Checkout timeout fix',
      shortcut: 'Start: Checkout timeout fix',
    },
    atOnce: 'stopped',
    calls: ['stop'],
    drawn: { kind: 'stopped', why: null },
  },
  {
    name: 'a start sends what the surface showed',
    running: null,
    press: { action: 'start', taskName: 'Filter panel', projectId: 'p1' },
    answers: [null],
    pressed: {
      kind: 'running',
      title: 'Filter panel',
      detail: 'Warehouse dashboard',
      color: '#5B8DEF',
      startedAt: 0,
      next: { taskName: 'Filter panel', projectId: 'p1' },
      why: null,
      tile: 'Filter panel',
      shortcut: 'Stop',
    },
    atOnce: 'running',
    calls: ['start Filter panel'],
    drawn: { kind: 'running', title: 'Filter panel', why: null },
  },
  {
    name: 'a first-day start runs Untitled, on no project',
    running: null,
    firstDay: true,
    press: { action: 'start', taskName: '', projectId: null },
    answers: [null],
    pressed: {
      kind: 'running',
      title: 'Untitled',
      detail: null,
      color: null,
      startedAt: 0,
      next: { taskName: '', projectId: null },
      why: null,
      tile: 'Untitled',
      shortcut: 'Stop',
    },
    atOnce: 'running',
    calls: ['start '],
    drawn: { kind: 'running', title: 'Untitled' },
  },
  {
    name: 'a refused stop draws what the server holds, with the reason',
    running: entry(),
    press: { action: 'stop' },
    answers: [noTimer],
    atOnce: 'stopped',
    calls: ['stop'],
    drawn: { kind: 'running', why: 'Not stopped: No timer' },
  },
  {
    name: 'a press that fails with nothing cached keeps the drawn state',
    running: entry(),
    offline: true,
    press: { action: 'stop' },
    answers: [unreachable],
    calls: ['stop'],
    drawn: { kind: 'kept', why: 'Not stopped: can’t reach Stint' },
  },
  {
    name: 'the next press clears the reason',
    running: entry(),
    press: { action: 'stop' },
    answers: [new ApiError(500, { code: 'INTERNAL', message: 'Broke.' }), null],
    atOnce: 'stopped',
    calls: ['stop', 'stop'],
    drawn: { kind: 'stopped', why: null },
  },
];

for (const row of pressRows) {
  test(row.name, async () => {
    const s = setup(row.running);
    const api = s.api as { taskNames: unknown; summary: unknown };
    if (row.firstDay) api.taskNames = async () => ({ taskNames: [] });
    if (row.offline)
      api.summary = async () => {
        throw unreachable;
      };
    else await s.surfaces.refresh();
    if (row.pressed)
      assert.deepEqual(pressedState(s.last() as SurfaceState), row.pressed);

    for (const answer of row.answers) {
      s.failWith(answer);
      s.holdPresses();
      const press = s.surfaces.press(row.press);
      await tick();
      if (row.atOnce) assert.equal(s.last()?.kind, row.atOnce);
      s.answer();
      await press;
    }

    assert.deepEqual(s.calls, row.calls);
    const last = s.last() as Record<string, unknown>;
    for (const [k, v] of Object.entries(row.drawn))
      assert.deepEqual(last[k], v, k);
  });
}

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
  const { surfaces, drawn, holdPresses, answer, api, last } = setup(entry());
  await surfaces.refresh();
  holdPresses();
  const press = surfaces.press({ action: 'stop' });
  const before = drawn.length;
  await surfaces.refresh();
  assert.equal(drawn.length, before);
  answer();
  await press;
  assert.equal(last()?.kind, 'stopped');

  // Another client starts a timer; its push draws it here.
  await (api as { startTimer: (b: object) => Promise<unknown> }).startTimer({
    id: 'e2',
    taskName: 'Started on the web',
  });
  await surfaces.refresh();
  const now = last();
  assert.ok(now?.kind === 'running');
  assert.equal(now.title, 'Started on the web');
});

test('an unchanged state is not drawn twice', async () => {
  const { surfaces, drawn } = setup(entry());
  await surfaces.refresh();
  const n = drawn.length;
  await surfaces.refresh();
  assert.equal(drawn.length, n);
});

test('a refresh leaves the screen its whole Recent list', async () => {
  const { surfaces, queryClient } = setup(null);
  await surfaces.refresh();
  const names = queryClient.getQueryData(keys.taskNames({})) as unknown[];
  assert.equal(names.length, RECENT_FETCHED);
});

/** The app's cache as an open screen holds it: fetched `agoS` seconds ago. */
function openScreen(s: ReturnType<typeof setup>, { agoS = 0, skewS = 0 } = {}) {
  const fetchedAt = Date.now() - agoS * 1000;
  const serverTime = new Date(fetchedAt + skewS * 1000);
  const running = entry({
    startedAt: new Date(serverTime.getTime() - 3_600_000).toISOString(),
  });
  s.queryClient.setQueryData(
    keys.summary(TZ),
    {
      running,
      todaySeconds: 3600,
      weekSeconds: 3600,
      serverTime: serverTime.toISOString(),
    },
    { updatedAt: fetchedAt },
  );
  return running;
}
test('a surface Stop with the app open keeps Today where it stood', async () => {
  const s = setup(entry());
  openScreen(s, { agoS: 60 });
  s.holdPresses();
  const press = s.surfaces.press({ action: 'stop' });
  await tick();
  const predicted = s.queryClient.getQueryData<Summary>(keys.summary(TZ));
  assert.equal(predicted?.running, null);
  // The hour fetched, plus the minute counted since.
  assert.ok(Math.abs((predicted?.todaySeconds ?? 0) - 3660) <= 2);
  s.answer();
  await press;
});

test("a surface press predicts in the server's clock", async () => {
  const s = setup(entry());
  openScreen(s, { skewS: 300 });
  s.holdPresses();
  const press = s.surfaces.press({ action: 'stop' });
  await tick();
  const predicted = s.queryClient.getQueryData<Summary>(keys.summary(TZ));
  const ahead = Date.parse(predicted?.serverTime ?? '') - Date.now();
  assert.ok(Math.abs(ahead - 300_000) < 2000);
  s.answer();
  await press;
});

test("a surface Stop finishes the running row in Today's list", async () => {
  const s = setup(entry());
  const running = openScreen(s);
  const list = keys.entries({ from: '2000-01-01T00:00:00.000Z' });
  s.queryClient.setQueryData(list, { entries: [running] });
  s.holdPresses();
  const press = s.surfaces.press({ action: 'stop' });
  await tick();
  const rows = s.queryClient.getQueryData<{ entries: TimeEntry[] }>(list);
  assert.notEqual(rows?.entries[0]?.endedAt, null);
  s.answer();
  await press;
});

test('a refetch whose clock reading moved by milliseconds draws nothing new', async () => {
  const s = setup(entry());
  let jitter = 0;
  const api = s.api as { summary: () => Promise<Summary> };
  api.summary = async () => {
    jitter += 7;
    return {
      ...summary(entry()),
      serverTime: new Date(Date.now() + jitter).toISOString(),
    };
  };
  await s.surfaces.refresh();
  const n = s.drawn.length;
  await s.surfaces.refresh();
  assert.equal(s.drawn.length, n);
});
