import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importsOf, orphans } from './tests.mjs';

describe('importsOf', () => {
  const files = new Set([
    'apps/web/src/components/calendar.tsx',
    'apps/web/src/lib/client/use-beat.ts',
    'apps/web/src/mocks/db.ts',
    'apps/web/src/calendar.stories.tsx',
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

  it('leaves out mocks and stories, which are a test’s helpers, not its subject', () => {
    const src = `import { account } from '@/mocks/db';
      import * as stories from './calendar.stories';`;
    assert.deepEqual(importsOf('apps/web/src/a.stories.tsx', src, exists), []);
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
