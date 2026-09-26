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
const pr = process.argv[2];

if (!/^\d+$/.test(pr ?? '')) {
  console.error('usage: pnpm try-mac <pr number>');
  process.exit(1);
}

const out = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
const run = (cmd, args, cwd = root, env = process.env) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env });

/* Beside the main checkout, whichever worktree this runs from: the shared
   `.git` is the main checkout's. */
const main = dirname(
  resolve(root, out('git', ['rev-parse', '--git-common-dir'])),
);
const dest = resolve(main, '..', `${basename(main)}-review`);

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
/* Vercel's branch alias, as `.github/workflows/preview-db.yml` builds it.
   Past 63 characters Vercel truncates and hashes it. */
const host = `stint-git-${branch.toLowerCase().replace(/[^a-z0-9]/g, '-')}-blakeeriks-projects`;
if (host.length > 63) {
  console.error(`${branch} is too long for Vercel's branch alias.`);
  process.exit(1);
}
const url = `https://${host}.vercel.app`;

/* By SHA: FETCH_HEAD belongs to the worktree that fetched, not to `dest`. */
run('git', ['fetch', '--quiet', 'origin', branch]);
const sha = out('git', ['rev-parse', 'FETCH_HEAD']);

if (!existsSync(dest)) {
  run('git', ['worktree', 'add', '--detach', dest, sha]);
} else {
  if (out('git', ['status', '--porcelain'], dest)) {
    console.error(`${dest} has uncommitted changes — not switching it.`);
    process.exit(1);
  }
  run('git', ['checkout', '--quiet', '--detach', sha], dest);
}

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
