import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  duplicateCoverage,
  importsOf,
  orphans,
  parseJUnit,
  slowest,
  timingsRun,
} from './tests.mjs';

describe('importsOf', () => {
  const files = new Set([
    'apps/web/src/components/calendar.tsx',
    'apps/web/src/lib/client/use-beat.ts',
    'apps/web/src/mocks/db.ts',
    'apps/mobile/src/screens/timer-screen.tsx',
  ]);
  const exists = (p) => files.has(p);

  it('resolves relative and @/ imports to repo paths, per app', () => {
    const web = `import { Calendar } from '@/components/calendar';
      import { useBeat } from '../../src/lib/client/use-beat';
      import { render } from '@testing-library/react';`;
    assert.deepEqual(importsOf('apps/web/test/ui/x.test.tsx', web, exists), [
      'apps/web/src/components/calendar.tsx',
      'apps/web/src/lib/client/use-beat.ts',
    ]);
    const phone = `import { TimerScreen } from './timer-screen';`;
    assert.deepEqual(
      importsOf('apps/mobile/src/screens/t.stories.tsx', phone, exists),
      ['apps/mobile/src/screens/timer-screen.tsx'],
    );
  });

  it('leaves out mocks and fixtures, which are a test’s helpers, not its subject', () => {
    const src = `import { account } from '@/mocks/db';`;
    assert.deepEqual(importsOf('apps/web/src/a.stories.tsx', src, exists), []);
  });
});

describe('duplicateCoverage', () => {
  const graph = new Map([
    [
      'apps/web/src/components/calendar.stories.tsx',
      ['apps/web/src/components/calendar.tsx'],
    ],
    [
      'apps/web/test/ui/calendar.test.tsx',
      [
        'apps/web/src/components/calendar.tsx',
        'apps/web/src/lib/client/api.ts',
      ],
    ],
    ['apps/web/test/ui/beat.test.tsx', ['apps/web/src/lib/client/use-beat.ts']],
    [
      'apps/web/src/components/dock.stories.tsx',
      ['apps/web/src/lib/client/api.ts'],
    ],
  ]);

  it('flags a test that renders a component a story also renders', () => {
    assert.deepEqual(duplicateCoverage(graph), [
      {
        path: 'apps/web/test/ui/calendar.test.tsx',
        kind: 'duplicate-coverage',
        line: 1,
        detail:
          'renders apps/web/src/components/calendar.tsx, which apps/web/src/components/calendar.stories.tsx also covers',
      },
    ]);
  });
});

describe('orphans', () => {
  it('flags a test whose subject only tests import', () => {
    const graph = new Map([
      [
        'apps/web/test/ui/beat.test.tsx',
        ['apps/web/src/lib/client/use-beat.ts'],
      ],
      ['apps/web/test/ui/dock.test.tsx', ['apps/web/src/components/dock.tsx']],
    ]);
    const unreachable = new Set(['apps/web/src/lib/client/use-beat.ts']);
    assert.deepEqual(orphans(graph, unreachable), [
      {
        path: 'apps/web/test/ui/beat.test.tsx',
        kind: 'orphan-test',
        line: 1,
        detail:
          'tests apps/web/src/lib/client/use-beat.ts, which no production code imports',
      },
    ]);
  });
});

describe('parseJUnit', () => {
  it('reads each test’s file, name and seconds, unescaping the XML', () => {
    const xml = `<testsuites><testsuite name="test/ui/a.test.tsx">
      <testcase classname="test/ui/a.test.tsx" name="dialog &gt; saves &amp; closes" time="1.25"></testcase>
      <testcase classname="/runner/apps/web/test/routes.test.ts" name="POST /entries" time="0.5"/>
    </testsuite></testsuites>`;
    assert.deepEqual(parseJUnit(xml), [
      {
        file: 'test/ui/a.test.tsx',
        name: 'dialog > saves & closes',
        seconds: 1.25,
      },
      {
        file: '/runner/apps/web/test/routes.test.ts',
        name: 'POST /entries',
        seconds: 0.5,
      },
    ]);
  });

  it('names a story’s own file, not the runner that renders every story', () => {
    const xml = `<testcase classname="test/stories/stories.test.tsx" name="components/dock.stories.tsx &gt; Running" time="2"/>`;
    assert.deepEqual(parseJUnit(xml), [
      { file: 'components/dock.stories.tsx', name: 'Running', seconds: 2 },
    ]);
  });
});

describe('slowest', () => {
  const t = (suite, name, seconds) => ({
    suite,
    path: `${suite}.ts`,
    name,
    seconds,
  });

  it('reports the three slowest tests of each suite that take a second or more', () => {
    const found = slowest([
      t('ui', 'a', 4),
      t('ui', 'b', 3),
      t('ui', 'c', 2),
      t('ui', 'd', 1.5),
      t('ui', 'quick', 0.2),
      t('e2e', 'signs in', 12.34),
      t('core', 'fast', 0.4),
    ]);
    assert.deepEqual(
      found.map((f) => [f.path, f.value, f.detail]),
      [
        ['ui.ts', 4, 'slowest in ui: "a" takes 4s'],
        ['ui.ts', 3, 'slowest in ui: "b" takes 3s'],
        ['ui.ts', 2, 'slowest in ui: "c" takes 2s'],
        ['e2e.ts', 12.3, 'slowest in e2e: "signs in" takes 12.3s'],
      ],
    );
    assert.ok(found.every((f) => f.kind === 'slow-test'));
  });
});

describe('timingsRun', () => {
  const art = (name, expired = false) => ({ name, expired });

  it('picks the newest run that still has unexpired timings', () => {
    const artifacts = new Map([
      [3, []],
      [2, [art('timings-static', true), art('playwright-report')]],
      [1, [art('timings-static')]],
    ]);
    assert.equal(
      timingsRun([3, 2, 1], (id) => artifacts.get(id)),
      1,
    );
  });

  it('finds none when no run has timings, so the scan files the rest', () => {
    assert.equal(
      timingsRun([2, 1], () => []),
      null,
    );
    assert.equal(
      timingsRun([], () => []),
      null,
    );
  });
});
