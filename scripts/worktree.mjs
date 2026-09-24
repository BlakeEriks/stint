#!/usr/bin/env node
/**
 * Add a git worktree that can actually run.
 *
 *   pnpm worktree <branch>            # branch off main, ../stint-<branch>
 *   pnpm worktree <branch> --from foo # branch off something else
 *   pnpm worktree <branch> --at ../x  # somewhere other than ../stint-<branch>
 *
 * A fresh worktree is a fresh clone as far as the build is concerned: git
 * carries no `node_modules`, no `packages/design-tokens/dist` and no
 * `.env.development.local`, so `pnpm dev` there fails three separate ways
 * before it serves a page. This does the three.
 *
 * The env file is COPIED, not linked: a worktree is where you try things, and
 * a symlink would let one of those things edit the original. It is only ever
 * `.env.development.local`: `docs/local-dev.md` is emphatic that local dev
 * never points at production.
 *
 * Paths are derived from this file's own location, so nothing here knows
 * where the repo lives.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join('apps', 'web', '.env.development.local');

const argv = process.argv.slice(2);
const flags = new Map();
const bare = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags.set(argv[i], argv[++i]);
  else bare.push(argv[i]);
}

const [branch] = bare;
const from = flags.get('--from') ?? 'main';
const at = flags.get('--at');

if (!branch) {
  console.error('usage: pnpm worktree <branch> [--from <ref>] [--at <path>]');
  process.exit(1);
}

/* Sibling of the repo, named for it, so `stint-calendar-panel` sits beside
   `stint` rather than inside it — a worktree nested in the repo would land in
   its own file watchers and its own globs. */
const dest = resolve(root, at ?? join('..', `${basename(root)}-${branch}`));

if (existsSync(dest)) {
  console.error(`${dest} already exists.`);
  process.exit(1);
}

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

console.log(`\nworktree: ${branch} off ${from} → ${dest}\n`);
run('git', ['worktree', 'add', '-b', branch, dest, from]);

/* Before install: a missing env file is the one failure that survives a
   successful build, so it is worth knowing about now rather than at the first
   blank page. */
const env = join(root, ENV);
if (existsSync(env)) {
  copyFileSync(env, join(dest, ENV));
  console.log(`\ncopied ${ENV}`);
} else {
  console.log(`\nno ${ENV} to copy — see docs/local-dev.md`);
}

console.log('\ninstalling…\n');
run('pnpm', ['install'], dest);

/* `dist/` is gitignored and two of its outputs are needed to build. `predev`
   would generate them on first run, but not before `test:ui` resolves
   `@stint/design-tokens`, which fails confusingly instead. */
console.log('\nbuilding design tokens…\n');
run('pnpm', ['--filter', '@stint/design-tokens', 'build'], dest);

/* `dev` lives in apps/web and reads PORT, so a --port flag at the root has
   no script to reach. :3100 is likely taken by the checkout this ran from. */
console.log(`\nready:\n  cd ${dest}/apps/web && PORT=3101 pnpm dev\n`);
