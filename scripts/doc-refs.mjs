#!/usr/bin/env node
// Fails when a foundational doc names a path or a pnpm script that no longer
// exists. /doc-drift judges prose on each PR; this is the deterministic half,
// so a rename that forgets a doc fails `verify:static` instead of rotting.

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DOCS = [
  'CLAUDE.md',
  '.specify/memory/constitution.md',
  'docs/CLAUDE.md',
  'docs/positioning.md',
  'docs/sdlc.md',
  'docs/architecture.md',
  'docs/data-model.md',
  'docs/api.md',
  'docs/deploying.md',
  'docs/local-dev.md',
  'docs/setup.md',
  'docs/macos.md',
  'docs/design/deriving-color.md',
  ...[
    'api-layer',
    'invoicing',
    'migrations',
    'positioning',
    'routing',
    'testing',
    'tooling',
    'web-ui',
  ].map((r) => `.claude/rules/${r}.md`),
];

// Where a bare name may live, besides the repo root and the doc's own folder.
const ROOTS = [
  '',
  'apps/web/',
  'apps/web/src/',
  'apps/web/src/app/',
  'apps/web/src/components/',
  'apps/web/src/lib/',
  'apps/web/test/',
  'apps/macos/',
  'packages/',
  'packages/design-tokens/',
  'packages/design-tokens/dist/',
  'packages/design-tokens/src/',
  'supabase/',
  'supabase/migrations/',
  'docs/',
  'scripts/',
  '.github/',
  '.github/workflows/',
];

const dirs = new Set(readdirSync('.'));
const TOP =
  /^(apps|packages|docs|scripts|supabase|\.github|\.claude|\.specify|src|test|e2e)\//;

// Storybook titles (`Screens/Home`) are checked against the stories.
const storyTitles = () => {
  try {
    return execSync("git grep -h -o \"title: '[^']*'\" -- '*.stories.tsx'", {
      encoding: 'utf8',
    });
  } catch {
    return ''; // no stories, or not a git checkout
  }
};
const titles = new Set(
  storyTitles()
    .split('\n')
    .map((l) => l.slice(8, -1)),
);

const scripts = new Set();
for (const pkg of [
  'package.json',
  'apps/web/package.json',
  'packages/core/package.json',
  'packages/design-tokens/package.json',
]) {
  if (existsSync(pkg))
    for (const s of Object.keys(
      JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {},
    ))
      scripts.add(s);
}

// A path: a file with an extension, or anything under a repo directory.
// Package specifiers, MIME types and utilities (`next/link`, `bg-black/50`)
// have neither, so they pass untouched.
const EXT =
  /\.(md|mjs|js|ts|tsx|json|jsonc|yml|yaml|sql|swift|css|html|sh|toml)$/;
const looksLikePath = (t) =>
  /^[\w.-][\w./-]*$/.test(t) &&
  !/^\.\w+$/.test(t) &&
  !t.includes('...') &&
  (EXT.test(t) || TOP.test(t) || dirs.has(t.split('/')[0]));

// Named to say it is not used: "`proxy.ts`, not `middleware.ts`".
const NAMED_AS_ABSENT = new Set(['middleware.ts']);

const ignored = (path) =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', path]).status === 0;

const missing = [];
for (const doc of DOCS) {
  if (!existsSync(doc)) {
    missing.push(`${doc}: the doc itself is gone; drop it from DOCS`);
    continue;
  }
  const text = readFileSync(doc, 'utf8');
  for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
    const pnpm = token.match(/^pnpm (?:--filter \S+ )?([\w:-]+)$/);
    if (token === 'pnpm --filter') continue;
    if (pnpm) {
      if (
        !scripts.has(pnpm[1]) &&
        !['install', 'dlx', 'exec'].includes(pnpm[1])
      )
        missing.push(`${doc}: \`${token}\` — no such script`);
      continue;
    }
    if (/^(Screens|Foundations|Parts|Primitives|Marketing)\//.test(token)) {
      if (![...titles].some((t) => token === t || token.startsWith(`${t}/`)))
        missing.push(`${doc}: \`${token}\` — no story has this title`);
      continue;
    }
    if (!looksLikePath(token) || NAMED_AS_ABSENT.has(token)) continue;
    const bare = token.replace(/\/$/, '');
    const found = [
      ...ROOTS.map((r) => r + bare),
      join(dirname(doc), bare),
    ].some((p) => existsSync(p));
    // A gitignored file (an env file, a build output) exists on a dev machine
    // and never in CI, so its absence here proves nothing.
    if (!found && !ignored(bare))
      missing.push(`${doc}: \`${token}\` — not found`);
  }
}

if (missing.length) {
  console.error(
    `${missing.length} dead reference(s):\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  `doc refs: ${DOCS.length} docs, every named path and script exists`,
);
