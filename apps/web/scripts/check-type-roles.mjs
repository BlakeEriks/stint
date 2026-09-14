#!/usr/bin/env node
/**
 * Typography lives in the design system. Nowhere else.
 *
 *   node scripts/check-type-roles.mjs 'src/**' '*.tsx'
 *
 * A component names a ROLE from `type.scale` (`type-label`, `type-amount`)
 * and never assembles one from parts. The roles are generated as real
 * `@utility` classes by the token build, so a role is a single class that
 * carries family, size, weight, tracking, case and tabular-nums together.
 *
 * Why this has to be enforced rather than documented: the scale was already
 * documented in `docs/design/brand.html` and the app still accumulated
 * twelve arbitrary font sizes across twenty-five components — including two
 * that differed by 0.5px for no reason, and a nav that used the label
 * tracking at 0.14em while the scale said 0.16em. Nothing failed, because
 * Tailwind emits `text-[13.5px]` happily.
 *
 * The same silence applies to a typo'd role: `type-lable` produces no CSS,
 * no warning, and exit 0 — verified against Tailwind 4.3.3. So this also
 * checks every `type-*` against the generated scale.
 *
 * `src/components/ui/**` is exempt: it is vendored shadcn, policed by
 * shadcn-detox.mjs instead.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scale = JSON.parse(
  readFileSync(
    join(here, '../../../packages/design-tokens/tokens.json'),
    'utf8',
  ),
).type.scale;
const ROLES = new Set(Object.keys(scale));

/** Each pattern names what to use instead, because "don't" is not guidance. */
const BANNED = [
  [
    /\btext-\[[\d.]+(px|rem|em)\]/g,
    'an arbitrary font size',
    'use a type-* role',
  ],
  [/\btracking-\[[^\]]+\]/g, 'arbitrary letter-spacing', 'belongs to the role'],
  [
    /\btracking-(tight|tighter|wide|wider|widest|normal)\b/g,
    "Tailwind's tracking scale",
    'belongs to the role',
  ],
  [/\bfont-(mono|sans)\b/g, 'a bare font family', 'the role sets the family'],
  [
    /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
    'a bare font weight',
    'the role sets the weight',
  ],
  [
    /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/g,
    "Tailwind's font scale",
    'use a type-* role',
  ],
  [
    /\btabular\b(?!-)/g,
    'the old .tabular helper',
    'mono roles set tabular-nums',
  ],
];

const patterns = process.argv.slice(2);
const files = patterns
  .flatMap((p) => globSync(p, { cwd: here + '/..' }))
  .filter((f) => !f.includes('components/ui/'))
  .map((f) => join(here, '..', f));

let bad = 0;
for (const file of [...new Set(files)]) {
  const src = readFileSync(file, 'utf8');
  const rel = file.replace(/.*apps\/web\//, '');

  /* Prose about the system is not a violation of it, and a block comment
     spans lines — so blank them out first while preserving line numbers. */
  const scrubbed = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );

  scrubbed.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const [re, what, fix] of BANNED) {
      for (const m of code.matchAll(re)) {
        console.error(`${rel}:${i + 1}  ${what} \`${m[0]}\` — ${fix}`);
        bad += 1;
      }
    }
    // A role that does not exist renders as nothing, silently.
    for (const m of code.matchAll(/\btype-([a-z][a-z0-9-]*)\b/g)) {
      if (!ROLES.has(m[1])) {
        console.error(
          `${rel}:${i + 1}  \`${m[0]}\` is not a role in type.scale — ` +
            `it compiles to no CSS. Roles: ${[...ROLES].join(', ')}`,
        );
        bad += 1;
      }
    }
  });
}

if (bad > 0) {
  console.error(
    `\n${bad} typography escape(s). Add a role to packages/design-tokens/` +
      `tokens.json (with a reason) rather than a one-off at the call site.\n`,
  );
  process.exit(1);
}
console.log(`type roles: clean (${[...new Set(files)].length} files)`);
