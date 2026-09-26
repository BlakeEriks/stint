#!/usr/bin/env node
/**
 * Hygiene scan: runs the standard tools, then ranks files by debt × churn.
 *
 *   Biome     cognitive complexity over 15 (SonarSource's metric and limit)
 *   jscpd     duplicated blocks of 100+ tokens (Sonar's default)
 *   Knip      unused files, exports and dependencies
 *   Vale      prose against the Google style guide and our house rules
 *
 * usage: pnpm hygiene [paths...] [--since 30.days] [--top N] [--json]
 *                     [--skip-filed]
 *
 * Paths narrow the report to files under them. --skip-filed drops files that
 * already have a `hygiene` issue (needs `gh`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { filedPaths, rank, THRESHOLD } from './rank.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = join(ROOT, 'node_modules/.bin');

const CODE = ['apps/web/src', 'packages', 'scripts'];
const DOCS = ['docs', 'CLAUDE.md'];
/* Tests repeat their arrangement on purpose, and shadcn's vendored
   components are upstream's code. */
const EXCLUDED = /(^|\/)(test|e2e|node_modules|dist)\/|components\/ui\//;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: 'string', default: '30.days' },
    top: { type: 'string' },
    json: { type: 'boolean', default: false },
    'skip-filed': { type: 'boolean', default: false },
  },
});

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
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
  const report = join(dir, 'jscpd-report.json');
  if (!existsSync(report)) return [];
  return JSON.parse(readFileSync(report, 'utf8')).duplicates.flatMap((d) => {
    const [a, b] = [d.firstFile, d.secondFile];
    return [
      [a, b],
      [b, a],
    ].map(([self, other]) => ({
      path: self.name,
      kind: 'duplication',
      line: self.start,
      detail: `${d.lines} lines duplicated at ${other.name}:${other.start}`,
    }));
  });
}

function deadCode() {
  const out = run(join(BIN, 'knip'), ['--reporter=json', '--no-progress']);
  return JSON.parse(out).issues.flatMap((issue) =>
    Object.entries(issue).flatMap(([type, items]) =>
      Array.isArray(items)
        ? items.map((item) => ({
            path: issue.file,
            kind: 'dead-code',
            line: item.line ?? 1,
            detail:
              type === 'files'
                ? 'unused file'
                : `unused ${type.replace(/ies$/, 'y').replace(/s$/, '')}: ${item.name}`,
          }))
        : [],
    ),
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
const inScope = (path) =>
  !EXCLUDED.test(path) &&
  (!scope.length || scope.some((p) => path === p || path.startsWith(`${p}/`)));

const findings = [complexity(), duplication(), deadCode(), prose()]
  .flat()
  .filter((f) => inScope(f.path));
let files = rank(
  findings,
  commits(values.since),
  values['skip-filed'] ? filed() : new Set(),
);
if (values.top) files = files.slice(0, Number(values.top));

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
