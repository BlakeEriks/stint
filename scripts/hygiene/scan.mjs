#!/usr/bin/env node
/**
 * Hygiene scan: runs the standard tools, then ranks files by debt × churn.
 *
 *   Biome     cognitive complexity over 15 (SonarSource's metric and limit)
 *   jscpd     duplicated blocks of 100+ tokens (Sonar's default)
 *   Knip      unused files, exports and dependencies
 *   fixes     three or more merged fixes in 90 days, on a whole-repo scan
 *             only, since it needs `gh`
 *   Vale      prose against the Google style guide and our house rules
 *   tests     duplicate coverage, orphans, and each suite's slowest tests
 *             from main's newest CI run, on a whole-repo scan only: a scoped
 *             run is /reduce's, which has no step for them
 *
 * usage: pnpm hygiene [paths...] [--since 30.days] [--top N] [--json]
 *                     [--skip-filed]
 *
 * Paths narrow the report to files under them. --skip-filed drops files that
 * already have a `hygiene` issue (needs `gh`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { filedPaths, fixChurn, rank, THRESHOLD, top } from './rank.mjs';
import {
  duplicateCoverage,
  importsOf,
  orphans,
  parseJUnit,
  slowest,
  timingsRun,
} from './tests.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'node_modules/.bin');

const CODE = ['apps/web/src', 'packages', 'scripts'];
const DOCS = ['docs', 'CLAUDE.md'];
/* Tests repeat their arrangement on purpose, and shadcn's vendored
   components are upstream's code. Test findings are about tests. */
const EXCLUDED = /(^|\/)(test|e2e|node_modules|dist)\/|components\/ui\//;
const TEST_KINDS = new Set(['duplicate-coverage', 'orphan-test', 'slow-test']);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: 'string', default: '30.days' },
    top: { type: 'string' },
    json: { type: 'boolean', default: false },
    'skip-filed': { type: 'boolean', default: false },
  },
});

/* `ok` lists the exit codes that mean "ran": Knip exits 1 when it finds
   something. Anything else fails the scan, rather than letting a broken tool
   report a clean file. */
function run(cmd, args, ok = [0]) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (!ok.includes(r.status)) {
    throw new Error(`${cmd} exited ${r.status}:\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function complexity() {
  const out = run(join(BIN, 'biome'), [
    'lint',
    '--only=complexity/noExcessiveCognitiveComplexity',
    '--reporter=json',
    '--max-diagnostics=none',
    ...CODE,
  ]);
  return JSON.parse(out).diagnostics.map((d) => {
    const value = Number(d.message.match(/complexity of (\d+)/)[1]);
    return {
      path: d.location.path,
      kind: 'complexity',
      line: d.location.start.line,
      value,
      detail: `cognitive complexity ${value} (max ${THRESHOLD})`,
    };
  });
}

function duplication() {
  const dir = mkdtempSync(join(tmpdir(), 'jscpd-'));
  run(join(BIN, 'jscpd'), [
    '--min-tokens=100',
    '--format=typescript,tsx,javascript',
    '--reporters=json',
    `--output=${dir}`,
    // From the root, so reported paths are repo-relative; inScope() narrows.
    '--ignore=**/node_modules/**,**/dist/**,**/.next/**,apps/macos/**',
    '.',
  ]);
  /* One finding per pair, on the first file: two would file two issues
     for one extraction. */
  const report = join(dir, 'jscpd-report.json');
  return JSON.parse(readFileSync(report, 'utf8')).duplicates.map((d) => ({
    path: d.firstFile.name,
    kind: 'duplication',
    line: d.firstFile.start,
    detail: `${d.lines} lines duplicated at ${d.secondFile.name}:${d.secondFile.start}`,
  }));
}

/* Knip's issue types, as a finding reads. */
const KNIP = {
  files: 'unused file',
  dependencies: 'unused dependency',
  devDependencies: 'unused devDependency',
  optionalPeerDependencies: 'unused peer dependency',
  exports: 'unused export',
  types: 'unused type',
  nsExports: 'unused namespace export',
  nsTypes: 'unused namespace type',
  enumMembers: 'unused enum member',
  namespaceMembers: 'unused namespace member',
  classMembers: 'unused class member',
  duplicates: 'duplicate export',
  unlisted: 'dependency used but not listed',
  binaries: 'binary used but not listed',
  unresolved: 'unresolved import',
};

function deadCode() {
  const out = run(
    join(BIN, 'knip'),
    ['--reporter=json', '--no-progress'],
    [0, 1],
  );
  return JSON.parse(out).issues.flatMap((issue) =>
    Object.entries(KNIP).flatMap(([type, label]) =>
      (issue[type] ?? []).map((item) => {
        // A duplicate is a group of names exported twice.
        const names = [item].flat();
        return {
          path: issue.file,
          kind: 'dead-code',
          line: names[0].line ?? 1,
          detail:
            type === 'files'
              ? label
              : `${label}: ${names.map((n) => n.name).join(' = ')}`,
        };
      }),
    ),
  );
}

/* The labels `/work-issues` gives a fault a user meets. */
const FIX_LABELS = ['wrong data', 'misleading', 'looks wrong'];

function fixes() {
  const since = new Date(Date.now() - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const json = (args) => JSON.parse(run('gh', [...args, '--limit=500']));
  const labeled = (labels) =>
    new Set(
      labels
        .flatMap((label) =>
          json([
            'issue',
            'list',
            '--state=all',
            `--label=${label}`,
            '--json=number',
          ]),
        )
        .map((i) => i.number),
    );
  const prs = json([
    'pr',
    'list',
    '--state=merged',
    `--search=merged:>=${since}`,
    '--json=number,mergedAt,files,closingIssuesReferences',
  ]);
  // Source only: a doc changes beside a fix, not because of one.
  return fixChurn(prs, labeled(FIX_LABELS), labeled(['hygiene'])).filter((f) =>
    /\.(ts|tsx|mjs|js|swift)$/.test(f.path),
  );
}

function prose() {
  if (!existsSync(join(ROOT, '.vale/styles/Google'))) run('vale', ['sync']);
  const out = run('vale', ['--output=JSON', '--no-exit', ...DOCS]);
  return Object.entries(JSON.parse(out)).flatMap(([path, alerts]) =>
    alerts.map((a) => ({
      path,
      kind: 'prose',
      line: a.Line,
      detail: `${a.Check}: ${a.Message}`,
    })),
  );
}

const tracked = run('git', ['ls-files']).split('\n').filter(Boolean);

/* Constitution V's suites; `node --test` scripts test tooling. */
const TEST_FILE = /\.(test\.tsx?|spec\.ts|stories\.tsx)$/;

function testFindings() {
  const files = new Set(tracked);
  const graph = new Map(
    tracked
      .filter((p) => TEST_FILE.test(p))
      .map((p) => [
        p,
        importsOf(p, readFileSync(join(ROOT, p), 'utf8'), (f) => files.has(f)),
      ]),
  );
  // Production mode leaves tests and stories out, so what only they import
  // shows as unused.
  const out = run(
    join(BIN, 'knip'),
    ['--production', '--include=files', '--reporter=json', '--no-progress'],
    [0, 1],
  );
  const unreachable = new Set(
    JSON.parse(out).issues.flatMap((i) => (i.files ?? []).map((f) => f.name)),
  );
  return [...duplicateCoverage(graph), ...orphans(graph, unreachable)];
}

/* A report names its file relative to its runner's root, or absolutely. */
const trackedAs = (file) =>
  tracked.find(
    (p) => file === p || file.endsWith(`/${p}`) || p.endsWith(`/${file}`),
  );

/* CI uploads a `timings-<job>` artifact of JUnit reports, one per suite,
   on each push to main (.github/workflows/ci.yml). */
function slowTests() {
  const runs = JSON.parse(
    run('gh', [
      'run',
      'list',
      '--workflow=ci.yml',
      '--branch=main',
      '--event=push',
      '--status=success',
      '--limit=20',
      '--json=databaseId',
    ]),
  ).map((r) => r.databaseId);
  const id = timingsRun(
    runs,
    (runId) =>
      JSON.parse(
        run('gh', [
          'api',
          `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`,
        ]),
      ).artifacts,
  );
  if (id === null) {
    console.error('hygiene: no CI run has timings, so no slow tests');
    return [];
  }
  const dir = mkdtempSync(join(tmpdir(), 'timings-'));
  run('gh', [
    'run',
    'download',
    String(id),
    '--pattern=timings-*',
    `--dir=${dir}`,
  ]);
  const timings = readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith('.xml'))
    .flatMap((f) =>
      parseJUnit(readFileSync(join(dir, f), 'utf8')).map((t) => ({
        ...t,
        suite: basename(f, '.xml'),
        path: trackedAs(t.file),
      })),
    )
    // A test whose file is gone since that run is not worth a finding.
    .filter((t) => t.path);
  return slowest(timings);
}

function commits(since) {
  const out = run('git', [
    'log',
    `--since=${since}`,
    '--name-only',
    '--format=',
  ]);
  const counts = new Map();
  for (const path of out.split('\n').filter(Boolean)) {
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return counts;
}

function filed() {
  const out = run('gh', [
    'issue',
    'list',
    '--label=hygiene',
    '--state=all',
    '--limit=500',
    '--json=body,state,stateReason,closedAt',
  ]);
  return filedPaths(JSON.parse(out));
}

const scope = positionals.map((p) => p.replace(/\/$/, ''));
const inScope = ({ path, kind }) =>
  (TEST_KINDS.has(kind) || !EXCLUDED.test(path)) &&
  (!scope.length || scope.some((p) => path === p || path.startsWith(`${p}/`)));

const findings = [
  complexity(),
  duplication(),
  deadCode(),
  scope.length ? [] : fixes(),
  prose(),
  scope.length ? [] : testFindings(),
  scope.length ? [] : slowTests(),
]
  .flat()
  .filter(inScope);
let files = rank(
  findings,
  commits(values.since),
  values['skip-filed'] ? filed() : new Set(),
);
if (values.top) {
  const n = Number(values.top);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--top must be a whole number, got ${values.top}`);
  }
  files = top(files, n);
}

if (values.json) {
  console.log(JSON.stringify(files, null, 2));
} else {
  console.log('score  debt  commits  file');
  for (const f of files) {
    const kinds = [...new Set(f.findings.map((x) => x.kind))].join(', ');
    console.log(
      `${String(f.score).padStart(5)}  ${String(f.debt).padStart(4)}m  ${String(f.commits).padStart(7)}  ${f.path}  (${kinds})`,
    );
  }
}
