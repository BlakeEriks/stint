#!/usr/bin/env node
/**
 * Open a PR's menu bar app against that PR's Vercel preview.
 *
 *   pnpm try-mac 24
 *
 * Builds `Stint Preview.app` from the PR's branch, pointed at its preview
 * deployment and signed in as its seeded account (`pr-24@preview.test`) —
 * the same deployment and data the PR's web link opens. It installs beside
 * Stint.app, so the app you use every day is untouched.
 *
 * The branch is checked out in `../stint-review`, never in this checkout, and
 * with plain `git worktree`: the Mac build is Swift alone and needs none of
 * what `pnpm worktree` installs.
 *
 * Needs Vercel's protection bypass secret in the Keychain, once:
 *
 *   security add-generic-password -s dev.stint.vercel-bypass -a stint -w <secret>
 *
 * Vercel → Settings → Deployment Protection → Protection Bypass for Automation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(root, '..', `${basename(root)}-review`);
const pr = process.argv[2];

if (!/^\d+$/.test(pr ?? '')) {
  console.error('usage: pnpm try-mac <pr number>');
  process.exit(1);
}

const out = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
const run = (cmd, args, cwd = root, env = process.env) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env });

let bypass;
try {
  bypass = out('security', [
    'find-generic-password',
    '-s',
    'dev.stint.vercel-bypass',
    '-w',
  ]);
} catch {
  console.error(`No Vercel bypass secret in the Keychain. Add it once:

  security add-generic-password -s dev.stint.vercel-bypass -a stint -w <secret>

Vercel → Settings → Deployment Protection → Protection Bypass for Automation.`);
  process.exit(1);
}

const branch = out('gh', [
  'pr',
  'view',
  pr,
  '--json',
  'headRefName',
  '-q',
  '.headRefName',
]);
run('git', ['fetch', '--quiet', 'origin', branch]);

if (!existsSync(dest)) {
  run('git', ['worktree', 'add', '--detach', dest, 'FETCH_HEAD']);
} else {
  if (out('git', ['status', '--porcelain'], dest)) {
    console.error(`${dest} has uncommitted changes — not switching it.`);
    process.exit(1);
  }
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dest);
}

/* Vercel's branch alias, as `.github/workflows/preview-db.yml` builds it. */
const slug = branch.toLowerCase().replace(/[^a-z0-9]/g, '-');
const url = `https://stint-git-${slug}-blakeeriks-projects.vercel.app`;

try {
  execFileSync('pkill', ['-f', 'Stint Preview.app/Contents/MacOS/Stint']);
} catch {
  // Not running.
}
run('./apps/macos/bundle.sh', ['release', 'preview'], dest, {
  ...process.env,
  STINT_PREVIEW_PR: pr,
  STINT_APP_URL: url,
  STINT_VERCEL_BYPASS: bypass,
});
run('open', [join(process.env.HOME, 'Applications', 'Stint Preview.app')]);
console.log(`\nPR #${pr} (${branch}) → ${url}, as pr-${pr}@preview.test`);
