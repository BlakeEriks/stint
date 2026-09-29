#!/usr/bin/env node
/**
 * Every mutation goes through `useOptimisticMutation`. Nowhere else.
 *
 *   node scripts/check-mutation-usage.mjs 'src/**' '*.tsx'
 *
 * FR-009, no opt-out: a file that imports `useMutation` from
 * `@tanstack/react-query` directly bypasses the predicted/pending,
 * rollback, timeout and supersession machinery `lib/client/mutations.ts`
 * gives for free. Only that module itself may import it.
 *
 * Same shape as check-type-roles.mjs: regex-scan rather than parse, so it
 * has no dependency beyond Node.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ALLOWED = 'src/lib/client/mutations.ts';

const IMPORT_RE =
  /import\s+(?:type\s+)?\{[^}]*\buseMutation\b[^}]*\}\s+from\s+['"]@tanstack\/react-query['"]/g;

const patterns = process.argv.slice(2);
const files = patterns
  .flatMap((p) => globSync(p, { cwd: here + '/..' }))
  .map((f) => join(here, '..', f));

let bad = 0;
for (const file of [...new Set(files)]) {
  const rel = relative(join(here, '..'), file);
  if (rel === ALLOWED) continue;

  const src = readFileSync(file, 'utf8');
  const scrubbed = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );

  for (const m of scrubbed.matchAll(IMPORT_RE)) {
    const upTo = scrubbed.slice(0, m.index).split('\n').length;
    console.error(
      `${rel}:${upTo}  imports \`useMutation\` directly — use ` +
        `useOptimisticMutation from lib/client/mutations.ts instead`,
    );
    bad += 1;
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} direct useMutation import(s). Route through ` +
      `useOptimisticMutation (${ALLOWED}) instead — no opt-out (FR-009).\n`,
  );
  process.exit(1);
}
console.log(`mutation usage: clean (${[...new Set(files)].length} files)`);
