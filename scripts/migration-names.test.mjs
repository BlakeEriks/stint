import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrationProblems } from './migration-names.mjs';

const main = new Map([
  ['00000000000034_feedback.sql', 'create table feedback ();'],
  ['00000000000035_drop_max_timer_hours.sql', 'alter table x drop y;'],
]);
const withFile = (name, sql = 'select 1;') => new Map([...main, [name, sql]]);

test('main unchanged, plus a timestamped migration, passes', () => {
  for (const name of [
    '20261011093000_add_notes.sql',
    '20261011093000_add-notes.sql',
  ]) {
    assert.deepEqual(migrationProblems(main, withFile(name)), [], name);
  }
});

test("a new migration sorting before main's last fails", () => {
  const later = withFile('20261011093000_later.sql');
  const problems = migrationProblems(
    later,
    new Map([...later, ['20261010120000_earlier.sql', 'select 2;']]),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sorts before 20261011093000_later\.sql/);
});

test('a new migration named by number fails', () => {
  assert.equal(
    migrationProblems(main, withFile('00000000000036_add_notes.sql')).length,
    1,
  );
});

test('a new migration whose timestamp is not a date fails', () => {
  for (const name of [
    '20261311093000_add_notes.sql',
    '2026101109300_add_notes.sql',
    '20261011093000.sql',
  ]) {
    assert.equal(migrationProblems(main, withFile(name)).length, 1, name);
  }
});

test('renaming a migration on main fails', () => {
  const renamed = new Map([
    ['00000000000034_feedback.sql', 'create table feedback ();'],
    ['00000000000036_drop_max_timer_hours.sql', 'alter table x drop y;'],
  ]);
  const problems = migrationProblems(main, renamed);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /00000000000035_drop_max_timer_hours\.sql/);
});

test('editing a migration on main fails', () => {
  const edited = new Map(main);
  edited.set('00000000000034_feedback.sql', 'create table feedback (id int);');
  assert.equal(migrationProblems(main, edited).length, 1);
});

test('two migrations sharing a version fail', () => {
  const current = withFile('20261011093000_a.sql');
  current.set('20261011093000_b.sql', 'select 2;');
  assert.equal(migrationProblems(main, current).length, 1);
});
