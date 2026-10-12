#!/usr/bin/env node
/**
 * Check supabase/migrations against main's, by the rules in
 * migration-names.mjs.
 *
 *   node scripts/check-migrations.mjs          # against origin/main
 *   node scripts/check-migrations.mjs <ref>    # against any commit
 *
 * The working tree is read from disk, so a migration not yet committed is
 * checked too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationProblems } from './migration-names.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = 'supabase/migrations';
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' });

// The merge base, so a branch behind main isn't blamed for main's newer files.
const base = git('merge-base', 'HEAD', process.argv[2] ?? 'origin/main').trim();

const main = new Map(
  git('ls-tree', '--name-only', `${base}:${rel}`)
    .split('\n')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => [f, git('show', `${base}:${rel}/${f}`)]),
);
const current = new Map(
  readdirSync(join(root, rel))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => [f, readFileSync(join(root, rel, f), 'utf8')]),
);

const problems = migrationProblems(main, current);
for (const p of problems) console.error(`  ✗ ${p}`);
if (problems.length > 0) process.exit(1);
console.log(`  ✓ ${current.size} migrations; none on main renamed or changed`);
