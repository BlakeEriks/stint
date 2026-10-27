#!/usr/bin/env node
/**
 * Every mutation goes through `useOptimisticMutation`, or its `pressOnce`
 * where no component holds the press. Nowhere else.
 *
 *   node scripts/check-mutation-usage.mjs
 *
 * Constitution VI, no opt-out: a file in the web or phone app that imports
 * `useMutation` or `MutationObserver` from `@tanstack/react-query` directly
 * bypasses the predicted/pending, rollback, timeout and supersession
 * machinery `packages/client/src/mutations.ts` gives both for free. Only
 * that module itself may import them.
 *
 * Same shape as check-type-roles.mjs: regex-scan rather than parse, so it
 * has no dependency beyond Node.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = 'packages/client/src/mutations.ts';
const PATTERNS = [
  'apps/web/src/**/*.{ts,tsx}',
  'apps/mobile/src/**/*.{ts,tsx}',
  'packages/client/src/**/*.ts',
];

const IMPORT_RE =
  /import\s+(?:type\s+)?\{[^}]*\b(?:useMutation|MutationObserver)\b[^}]*\}\s+from\s+['"]@tanstack\/react-query['"]/g;

const files = PATTERNS.flatMap((p) => globSync(p, { cwd: root })).map((f) =>
  join(root, f),
);

let bad = 0;
for (const file of [...new Set(files)]) {
  const rel = relative(root, file);
  if (rel === ALLOWED) continue;

  const src = readFileSync(file, 'utf8');
  const scrubbed = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );

  for (const m of scrubbed.matchAll(IMPORT_RE)) {
    const upTo = scrubbed.slice(0, m.index).split('\n').length;
    console.error(
      `${rel}:${upTo}  imports a mutation directly — use ` +
        `useOptimisticMutation from @stint/client instead`,
    );
    bad += 1;
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} direct mutation import(s). Route through ` +
      `useOptimisticMutation (${ALLOWED}) instead — no opt-out (Constitution VI).\n`,
  );
  process.exit(1);
}
console.log(`mutation usage: clean (${[...new Set(files)].length} files)`);
