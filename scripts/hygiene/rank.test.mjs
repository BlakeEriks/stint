import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { churnWeight, debtOf, filedPaths, rank } from './rank.mjs';

const complex = (path, value) => ({ path, kind: 'complexity', value });

describe('debtOf', () => {
  it('prices complexity as Sonar S3776 does: 5 minutes plus 1 per point over 15', () => {
    assert.equal(debtOf(complex('a.ts', 16)), 6);
    assert.equal(debtOf(complex('a.ts', 30)), 20);
  });
});

describe('rank', () => {
  it('sums every finding in a file into one entry', () => {
    const [file] = rank(
      [complex('a.ts', 20), { path: 'a.ts', kind: 'dead-code' }],
      new Map(),
    );
    assert.equal(file.debt, 10 + 5);
    assert.equal(file.findings.length, 2);
  });

  it('puts a churning file above an untouched one with the same debt', () => {
    const files = rank(
      [complex('quiet.ts', 20), complex('hot.ts', 20)],
      new Map([['hot.ts', 7]]),
    );
    assert.deepEqual(
      files.map((f) => f.path),
      ['hot.ts', 'quiet.ts'],
    );
    assert.equal(files[0].score, 10 * churnWeight(7));
    assert.equal(files[1].score, 10);
  });

  it('still ranks heavy debt in a quiet file above light debt in a hot one', () => {
    const files = rank(
      [complex('quiet.ts', 60), complex('hot.ts', 16)],
      new Map([['hot.ts', 15]]),
    );
    assert.equal(files[0].path, 'quiet.ts');
  });

  it('leaves out files that are already filed', () => {
    const files = rank(
      [complex('a.ts', 20), complex('b.ts', 20)],
      new Map(),
      new Set(['a.ts']),
    );
    assert.deepEqual(
      files.map((f) => f.path),
      ['b.ts'],
    );
  });
});

describe('filedPaths', () => {
  const now = Date.parse('2026-09-25');
  const issue = (path, state, stateReason = null, closedAt = null) => ({
    body: `Reduce it.\n\n<!-- hygiene:${path} -->`,
    state,
    stateReason,
    closedAt,
  });

  it('holds a file while its issue is open', () => {
    assert.deepEqual([...filedPaths([issue('a.ts', 'OPEN')], now)], ['a.ts']);
  });

  it('holds a fixed file for 30 days, so leftover findings are not refiled at once', () => {
    const recent = issue('a.ts', 'CLOSED', 'COMPLETED', '2026-09-20');
    const old = issue('b.ts', 'CLOSED', 'COMPLETED', '2026-08-01');
    assert.deepEqual([...filedPaths([recent, old], now)], ['a.ts']);
  });

  it('holds a declined file for 90 days, then files it again', () => {
    const recent = issue('a.ts', 'CLOSED', 'NOT_PLANNED', '2026-08-01');
    const old = issue('b.ts', 'CLOSED', 'NOT_PLANNED', '2026-05-01');
    assert.deepEqual([...filedPaths([recent, old], now)], ['a.ts']);
  });

  it('ignores issues without a marker', () => {
    assert.equal(
      filedPaths([{ body: 'hand-written', state: 'OPEN' }], now).size,
      0,
    );
  });
});
