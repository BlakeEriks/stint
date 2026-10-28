/**
 * Orphaned tests for the hygiene scan: a test whose subject only tests
 * import. What it tested was deleted or merged away, and the test alone
 * keeps the code alive, at the upkeep every test costs (Vocke, "The
 * Practical Test Pyramid", martinfowler.com, 2018). Knip's production mode
 * (knip.dev/features/production-mode) leaves tests out, so it reports such
 * a subject as unused.
 */

import { dirname, join, normalize } from 'node:path';

/* What a test imports to help it, not what it tests. */
const isHelper = (path) =>
  /\/(test|e2e|mocks|fixtures)\//.test(path) || path.endsWith('.stories.tsx');
const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '/index.ts',
  '/index.tsx',
];
const SPECIFIER = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function base(from, spec) {
  if (spec.startsWith('.')) return normalize(join(dirname(from), spec));
  if (spec.startsWith('@/')) {
    return `${from.match(/^apps\/[^/]+\//)?.[0] ?? ''}src/${spec.slice(2)}`;
  }
  return null;
}

/**
 * The repo files a test imports from its own app: relative and `@/` paths.
 * A package import is left out: it reaches the package's index, which
 * production always imports.
 * @param exists  (path) => whether the repo has that file
 */
export function importsOf(path, source, exists) {
  const found = [];
  for (const [, spec] of source.matchAll(SPECIFIER)) {
    const b = base(path, spec);
    const file = b && EXTENSIONS.map((e) => b + e).find(exists);
    if (file && !isHelper(file) && !found.includes(file)) found.push(file);
  }
  return found;
}

/**
 * A test whose subject nothing in production imports: what it tests was
 * deleted or merged away, and the test alone keeps it alive.
 * @param unreachable  Set of files Knip's production mode finds unused
 */
export function orphans(graph, unreachable) {
  return [...graph].flatMap(([path, subjects]) =>
    subjects
      .filter((s) => unreachable.has(s))
      .map((s) => ({
        path,
        kind: 'orphan-test',
        line: 1,
        detail: `tests ${s}, which no production code imports`,
      })),
  );
}
