import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@stint/client';
import {
  chooseNotice,
  notificationAccess,
  notificationStep,
  projectLookup,
  recentTasks,
  wholeMinutes,
} from '../src/screen-state.ts';

const lookup = projectLookup(
  [
    { id: 'p1', name: 'Warehouse dashboard', clientId: 'c1' },
    { id: 'p2', name: 'Admin and invoicing', clientId: null },
  ] as never,
  [{ id: 'c1', name: 'Northwind Trading', color: '#6EA1E2' }] as never,
);
const name = (taskName: string, projectId: string | null) => ({
  taskName,
  projectId,
  lastUsedAt: '2026-10-25T12:00:00.000Z',
});

test('Recent is the five newest names, the running one left out', () => {
  const names = [
    name('Running task', 'p1'),
    name('A', 'p1'),
    name('B', null),
    name('C', 'p2'),
    name('D', 'p1'),
    name('E', 'p1'),
  ];
  const recent = recentTasks(
    names,
    { taskName: 'Running task', projectId: 'p1' },
    lookup,
  );
  assert.deepEqual(
    recent.map((r) => r.taskName),
    ['A', 'B', 'C', 'D', 'E'],
  );
});

test('the same task on another project is not the running one', () => {
  const recent = recentTasks(
    [name('Standup', 'p2'), name('Standup', 'p1')],
    { taskName: 'Standup', projectId: 'p1' },
    lookup,
  );
  assert.deepEqual(
    recent.map((r) => r.projectId),
    ['p2'],
  );
});

test("a Recent row carries its project's name and its client's color", () => {
  const [withClient, internal, none] = recentTasks(
    [name('A', 'p1'), name('B', 'p2'), name('C', null)],
    null,
    lookup,
  );
  assert.deepEqual(withClient, {
    taskName: 'A',
    projectId: 'p1',
    projectName: 'Warehouse dashboard',
    color: '#6EA1E2',
  });
  assert.equal(internal?.projectName, 'Admin and invoicing');
  assert.equal(internal?.color, null);
  assert.equal(none?.projectName, null);
});

test('a refused press is shown before a failed read', () => {
  const dismiss = () => {};
  const notice = chooseNotice(
    { message: 'A timer is already running.', dismiss },
    new TypeError('Network request failed'),
  );
  assert.deepEqual(notice, {
    tone: 'error',
    message: 'A timer is already running.',
    onDismiss: dismiss,
  });
});

test("a failed read says Stint can't be reached", () => {
  assert.equal(chooseNotice(null, new TypeError('x'))?.tone, 'offline');
  assert.equal(
    chooseNotice(null, new ApiError(503, { code: 'UNKNOWN', message: '' }))
      ?.tone,
    'offline',
  );
});

test('a rejected session is sign-in, not a notice', () => {
  const unauthorized = new ApiError(401, { code: 'UNAUTHORIZED', message: '' });
  assert.equal(chooseNotice(null, unauthorized), null);
  assert.equal(chooseNotice(null, null), null);
});

test('Today reads 0m until the first minute is up', () => {
  assert.equal(wholeMinutes(0), '0m');
  assert.equal(wholeMinutes(59), '0m');
  assert.equal(wholeMinutes(61), '1m');
  assert.equal(wholeMinutes(3 * 3600 + 30 * 60 + 59), '3h 30m');
});

test('notifications: granted is on; refused for good is off; else ask', () => {
  assert.equal(notificationAccess({ granted: true, canAskAgain: false }), 'on');
  assert.equal(
    notificationAccess({ granted: false, canAskAgain: true }),
    'ask',
  );
  assert.equal(
    notificationAccess({ granted: false, canAskAgain: false }),
    'off',
  );
});

test('notifications off say so, with a way to turn them on', () => {
  const open = () => {};
  assert.deepEqual(chooseNotice(null, null, open), {
    tone: 'warning',
    message: 'Notifications are off, so a running timer isn’t pinned.',
    action: { label: 'Turn on', onPress: open },
  });
});

test('a refused press or a failed read comes before notifications off', () => {
  const open = () => {};
  const dismiss = () => {};
  assert.equal(
    chooseNotice({ message: 'No.', dismiss }, null, open)?.tone,
    'error',
  );
  assert.equal(chooseNotice(null, new TypeError('x'), open)?.tone, 'offline');
});

const granted = { granted: true, canAskAgain: false };
const askable = { granted: false, canAskAgain: true };
const refused = { granted: false, canAskAgain: false };

test('a launch asks once while Android still will', () => {
  assert.equal(notificationStep(null, askable, false).ask, true);
  assert.deepEqual(notificationStep(null, askable, true), {
    ask: false,
    next: 'off',
    redraw: false,
  });
});

test('notifications coming on redraw; staying on does not', () => {
  assert.deepEqual(notificationStep(null, granted, false), {
    ask: false,
    next: 'on',
    redraw: true,
  });
  assert.equal(notificationStep('off', granted, true).redraw, true);
  assert.equal(notificationStep('on', granted, true).redraw, false);
});

test('refused for good is off, with no prompt', () => {
  assert.deepEqual(notificationStep('on', refused, false), {
    ask: false,
    next: 'off',
    redraw: false,
  });
});
