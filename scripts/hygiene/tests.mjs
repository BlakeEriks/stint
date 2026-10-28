/**
 * Test findings for the hygiene scan: tests that cost upkeep without adding
 * a check. Grounded in:
 *
 * - Vocke, "The Practical Test Pyramid" (martinfowler.com, 2018), "Avoid
 *   Test Duplication": every test costs upkeep, so a behavior is tested once,
 *   as far down the pyramid as can see it.
 * - Software Engineering at Google, ch. 11: "the slower a test suite, the
 *   less frequently it will be run".
 *
 * No tool finds two tests asserting the same behavior. Coverage subsumption
 * is the academic answer, and it cuts tests that catch faults (Rothermel et
 * al., "Empirical studies of test-suite reduction", 2002). So a duplicate
 * here is a candidate: a test that renders a component a story also
 * renders. Whoever files it reads both and names the tests that repeat.
 */

import { dirname, join, normalize } from 'node:path';

/* What a test imports to help it, not what it tests. */
const HELPER = /\/(test|e2e|mocks|fixtures)\/|\.stories\.tsx$/;
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
 * A package import is left out, since its index re-exports everything and
 * would make every test share a subject.
 * @param exists  (path) => whether the repo has that file
 */
export function importsOf(path, source, exists) {
  const found = [];
  for (const [, spec] of source.matchAll(SPECIFIER)) {
    const b = base(path, spec);
    const file = b && EXTENSIONS.map((e) => b + e).find(exists);
    if (file && !HELPER.test(file) && !found.includes(file)) found.push(file);
  }
  return found;
}

const isStory = (path) => path.endsWith('.stories.tsx');
const finding = (path, kind, detail, value) => ({
  path,
  kind,
  line: 1,
  ...(value && { value }),
  detail,
});

/**
 * A test that renders a component a story renders too. Constitution V
 * gives a screen's states to its stories, so the finding is on the test.
 * @param graph  Map of test path -> the files it imports
 */
export function duplicateCoverage(graph) {
  const storyOf = new Map();
  for (const [path, subjects] of graph) {
    if (!isStory(path)) continue;
    for (const s of subjects) if (s.endsWith('.tsx')) storyOf.set(s, path);
  }
  return [...graph]
    .filter(([path]) => !isStory(path))
    .flatMap(([path, subjects]) =>
      subjects
        .filter((s) => storyOf.has(s))
        .map((s) =>
          finding(
            path,
            'duplicate-coverage',
            `renders ${s}, which ${storyOf.get(s)} also covers`,
          ),
        ),
    );
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
      .map((s) =>
        finding(
          path,
          'orphan-test',
          `tests ${s}, which no production code imports`,
        ),
      ),
  );
}

const XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(\w+);/g, (m, e) => XML[e] ?? m);

/**
 * Each test in a JUnit report, the format Vitest, Playwright and our Node
 * reporter all write. A story is named for its own file, since one runner
 * renders them all under a `describe` per file.
 */
export function parseJUnit(xml) {
  return [...xml.matchAll(/<testcase\b([^>]*)>/g)].map(([, attrs]) => {
    const a = Object.fromEntries(
      [...attrs.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [
        k,
        unescapeXml(v),
      ]),
    );
    const [first, ...rest] = a.name.split(' > ');
    const story = isStory(first) && rest.length > 0;
    return {
      file: story ? first : a.classname,
      name: story ? rest.join(' > ') : a.name,
      seconds: Number(a.time),
    };
  });
}

/* Under a second is not worth an issue; three per suite is where to look. */
const SLOW_SECONDS = 1;
const PER_SUITE = 3;

/**
 * The slowest tests of each suite, so its time is watched before it grows.
 * @param timings  [{ suite, path, name, seconds }]
 */
export function slowest(timings) {
  const bySuite = Map.groupBy(
    timings.filter((t) => t.seconds >= SLOW_SECONDS),
    (t) => t.suite,
  );
  return [...bySuite].flatMap(([suite, tests]) =>
    tests
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, PER_SUITE)
      .map((t) => {
        const s = Math.round(t.seconds * 10) / 10;
        return finding(
          t.path,
          'slow-test',
          `slowest in ${suite}: "${t.name}" takes ${s}s`,
          s,
        );
      }),
  );
}

/**
 * The newest run, of `runIds` newest first, that still has an unexpired
 * `timings-*` artifact; null when none does, as before CI first uploads
 * them or after a month without a push to main.
 * @param artifactsOf  (runId) => [{ name, expired }]
 */
export function timingsRun(runIds, artifactsOf) {
  const timed = (a) => a.name.startsWith('timings-') && !a.expired;
  return runIds.find((id) => artifactsOf(id).some(timed)) ?? null;
}
