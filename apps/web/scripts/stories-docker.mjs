#!/usr/bin/env node
/**
 * The story suite in the same Linux container CI uses, so the screenshots
 * compared here are the ones CI compares. `pnpm test:stories:docker` checks
 * them; `pnpm test:stories:docker -u` rewrites the baselines.
 *
 * Follows Playwright's documented Docker setup
 * (playwright.dev/docs/docker): the official image, pinned to the installed
 * Playwright, with `--ipc=host` so Chromium has the shared memory it needs.
 *
 * The repo is mounted, but every `node_modules` is a named volume: the host's
 * are built for macOS, and a Linux install on top of them would replace
 * them. The volumes are per worktree and survive between runs, so only the
 * first install is slow.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const { version } = createRequire(`${web}/`)('playwright/package.json');
const key = createHash('sha1').update(root).digest('hex').slice(0, 8);

const workspaces = [
  '.',
  'apps/web',
  ...readdirSync(join(root, 'packages')).map((p) => `packages/${p}`),
];
const volumes = workspaces.flatMap((w) => [
  '-v',
  `stint-stories-${key}-${w.replaceAll(/[/.]/g, '-') || 'root'}:/repo/${w}/node_modules`,
]);

// Arguments after the script's own reach vitest: `-u`, a story filter.
const args = process.argv.slice(2).join(' ');
const inside = [
  'corepack enable',
  'pnpm install --frozen-lockfile --store-dir /pnpm-store',
  'pnpm tokens',
  `cd ${join('/repo', relative(root, web))}`,
  `pnpm exec vitest run --project stories ${args}`,
].join(' && ');

const run = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    '-v',
    `${root}:/repo`,
    ...volumes,
    '-v',
    'stint-stories-pnpm-store:/pnpm-store',
    '-w',
    '/repo',
    '-e',
    'CI=1',
    '-e',
    'HUSKY=0',
    '-e',
    'STORY_SCREENSHOTS=1',
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'bash',
    '-c',
    inside,
  ],
  { stdio: 'inherit' },
);

process.exit(run.status ?? 1);
