import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatCompact, toBillableHours, elapsedSeconds } from '../src/duration.ts';
import { resolveRate, resolveRateSource, lineAmount } from '../src/rates.ts';
import { deriveTimerView, timerColorToken } from '../src/timer.ts';
import { uuidv7 } from '../src/uuid.ts';
import { coalesce, createMutation, isRetryable } from '../src/outbox.ts';

test('formatClock renders the timer format', () => {
  assert.equal(formatClock(0), '0:00:00');
  assert.equal(formatClock(6442), '1:47:22');
  assert.equal(formatClock(59), '0:00:59');
  assert.equal(formatClock(360000), '100:00:00'); // hours never truncate
  assert.equal(formatClock(-5), '0:00:00');
});

test('formatCompact for lists', () => {
  assert.equal(formatCompact(6442), '1h 47m');
  assert.equal(formatCompact(3600), '1h');
  assert.equal(formatCompact(120), '2m');
  assert.equal(formatCompact(45), '45s');
});

test('toBillableHours rounds to 2dp', () => {
  assert.equal(toBillableHours(3600), 1);
  assert.equal(toBillableHours(5400), 1.5);
  assert.equal(toBillableHours(1000), 0.28);
});

test('elapsedSeconds never goes negative on clock skew', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  assert.equal(elapsedSeconds('2026-09-11T11:00:00Z', now), 3600);
  assert.equal(elapsedSeconds('2026-09-11T13:00:00Z', now), 0);
});

test('rate resolution walks all four levels', () => {
  assert.equal(resolveRate({ entryRateOverride: 999, projectRate: 175, clientRate: 150, userDefaultRate: 100 }), 999);
  assert.equal(resolveRate({ projectRate: 175, clientRate: 150, userDefaultRate: 100 }), 175);
  assert.equal(resolveRate({ clientRate: 150, userDefaultRate: 100 }), 150);
  assert.equal(resolveRate({ userDefaultRate: 100 }), 100);
  assert.equal(resolveRate({}), null);
});

test('rate resolution treats 0 as a real rate, not absent', () => {
  // A deliberate 0 (pro bono) must not fall through to a lower level.
  assert.equal(resolveRate({ projectRate: 0, clientRate: 150 }), 0);
  assert.equal(resolveRateSource({ projectRate: 0, clientRate: 150 }), 'project');
});

test('rate source is reported for the UI', () => {
  assert.equal(resolveRateSource({ entryRateOverride: 10 }), 'entry');
  assert.equal(resolveRateSource({ clientRate: 150 }), 'client');
  assert.equal(resolveRateSource({}), 'none');
});

test('lineAmount rounds money once', () => {
  assert.equal(lineAmount(3600, 150), 150);
  assert.equal(lineAmount(5400, 150), 225);
  assert.equal(lineAmount(1000, 175), 48.61);
});

test('timer view: idle', () => {
  const v = deriveTimerView(null, 8);
  assert.equal(v.state, 'idle');
  assert.equal(v.seconds, 0);
});

test('timer view: running below threshold', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  const v = deriveTimerView(
    { id: 'x', taskName: 't', projectId: null, startedAt: '2026-09-11T10:00:00Z' }, 8, now);
  assert.equal(v.state, 'running');
  assert.equal(v.seconds, 7200);
  assert.equal(v.exceedsThreshold, false);
  assert.equal(timerColorToken(v.state), 'timer-running');
});

test('timer view: exceeded threshold switches to warning', () => {
  const now = new Date('2026-09-12T04:00:00Z'); // 16h later
  const v = deriveTimerView(
    { id: 'x', taskName: 't', projectId: null, startedAt: '2026-09-11T12:00:00Z' }, 8, now);
  assert.equal(v.state, 'exceeded');
  assert.equal(v.exceedsThreshold, true);
  assert.equal(timerColorToken(v.state), 'timer-warning');
});

test('uuidv7 is time-ordered and well-formed', () => {
  const a = uuidv7(1000000000000);
  const b = uuidv7(1000000000001);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(a < b, 'later timestamp must sort after earlier');
});

test('outbox coalesces repeated edits into one write', () => {
  const items = [
    createMutation('time_entry', 'e1', 'create', { taskName: 'a' }),
    createMutation('time_entry', 'e1', 'update', { taskName: 'b' }),
    createMutation('time_entry', 'e1', 'update', { projectId: 'p1' }),
  ];
  const out = coalesce(items);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.op, 'create', 'create must survive the merge');
  assert.deepEqual(out[0]!.payload, { taskName: 'b', projectId: 'p1' });
});

test('outbox drops create-then-delete entirely', () => {
  const out = coalesce([
    createMutation('time_entry', 'e1', 'create', { taskName: 'a' }),
    createMutation('time_entry', 'e1', 'delete', {}),
  ]);
  assert.equal(out.length, 0, 'server never needs to hear about it');
});

test('outbox keeps delete of a server-known entity', () => {
  const out = coalesce([
    createMutation('time_entry', 'e1', 'update', { taskName: 'a' }),
    createMutation('time_entry', 'e1', 'delete', {}),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.op, 'delete');
});

test('outbox preserves relative order across entities', () => {
  const out = coalesce([
    createMutation('client',     'c1', 'create', { name: 'N' }),
    createMutation('project',    'p1', 'create', { clientId: 'c1' }),
    createMutation('time_entry', 'e1', 'create', { projectId: 'p1' }),
    createMutation('client',     'c1', 'update', { name: 'N2' }),
  ]);
  assert.deepEqual(out.map((i) => i.entityId), ['c1', 'p1', 'e1'],
    'client must still precede the project that references it');
});

test('retry policy distinguishes server faults from rejections', () => {
  assert.equal(isRetryable(500), true);
  assert.equal(isRetryable(0), true);    // network down
  assert.equal(isRetryable(409), true);  // timer conflict — resolvable
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(400), false); // malformed — will never succeed
  assert.equal(isRetryable(403), false);
});
