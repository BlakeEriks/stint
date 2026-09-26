#!/usr/bin/env node
/**
 * Rewrites shadcn's palette names to this project's real tokens.
 *
 * shadcn ships its own semantic palette (`bg-primary`, `text-muted-foreground`).
 * Ours is derived in OKLCH with a contrast contract, and two of the names
 * collide with opposite meanings:
 *
 *   bg-primary  — shadcn: the main action color. Ours: neutral gray #CDD1DA.
 *   bg-accent   — shadcn: hover gray. Ours: the neon green.
 *
 * So shadcn's names are never defined in our @theme: an alias pointing at the
 * wrong color is invisible, while an undefined utility renders unstyled.
 *
 * But Tailwind 4 drops an unknown utility with no warning and exit 0
 * (verified against 4.3.3), so this script is the enforcement: `--check`
 * fails the build if any shadcn name survives in a vendored component.
 *
 *   node scripts/shadcn-detox.mjs src/components/ui/button.tsx   # rewrite
 *   node scripts/shadcn-detox.mjs --check 'src/components/ui/*'  # verify
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/**
 * Longest-first: `bg-accent` must not match inside `bg-accent-foreground`,
 * and `bg-destructive` must not match inside `bg-destructive/90`.
 *
 * Opacity modifiers are mapped explicitly rather than stripped: our palette
 * defines real hover/active steps, so `bg-primary/90` is `bg-accent-hover`,
 * not the accent at 90%.
 */
const MAP = [
  // --- import path: our alias resolves via tsconfig `@/`, not a bare word.
  ['from "cn"', "from '@/lib/cn'"],
  ["from 'cn'", "from '@/lib/cn'"],

  // --- focus ring (shadcn uses a 3px translucent ring; we have a real token)
  ['focus-visible:ring-ring/50', 'focus-visible:ring-edge-focus'],
  ['focus-visible:border-ring', 'focus-visible:border-edge-focus'],
  ['aria-invalid:ring-destructive/20', 'aria-invalid:ring-danger'],
  ['aria-invalid:ring-destructive/40', 'aria-invalid:ring-danger'],
  ['aria-invalid:border-destructive', 'aria-invalid:border-danger'],
  ['focus-visible:ring-destructive/20', 'focus-visible:ring-danger'],
  ['focus-visible:ring-destructive/40', 'focus-visible:ring-danger'],

  // --- opacity modifiers → real palette steps
  ['hover:bg-primary/90', 'hover:bg-accent-hover'],
  ['hover:bg-destructive/90', 'hover:bg-danger'],
  ['hover:bg-secondary/80', 'hover:bg-surface-active'],
  ['hover:bg-accent/50', 'hover:bg-surface-hover'],
  ['bg-input/30', 'bg-surface-elevated'],
  ['bg-input/50', 'bg-surface-active'],
  ['bg-primary/90', 'bg-accent-hover'],
  ['bg-destructive/60', 'bg-danger'],
  ['bg-destructive/90', 'bg-danger'],
  ['bg-accent/50', 'bg-surface-hover'],
  ['bg-muted/50', 'bg-surface-hover'],
  ['selection:bg-primary', 'selection:bg-accent-default'],
  ['selection:text-primary-foreground', 'selection:text-on-accent'],

  // --- foreground pairs (before their bare `bg-` counterparts)
  ['text-primary-foreground', 'text-on-accent'],
  ['text-secondary-foreground', 'text-primary'],
  ['text-destructive-foreground', 'text-on-accent'],
  ['text-accent-foreground', 'text-strong'],
  ['text-muted-foreground', 'text-muted'],
  ['text-card-foreground', 'text-primary'],
  ['text-popover-foreground', 'text-primary'],
  ['text-foreground', 'text-primary'],
  ['text-destructive', 'text-danger'],
  ['text-background', 'text-on-accent'],
  // shadcn's `text-primary` (link variant) means the action color.
  ['text-primary underline', 'text-accent-default underline'],

  // --- surfaces
  ['bg-primary', 'bg-accent-default'],
  ['bg-secondary', 'bg-surface-elevated'],
  ['bg-destructive', 'bg-danger'],
  ['bg-background', 'bg-surface-base'],
  ['bg-popover', 'bg-surface-elevated'],
  ['bg-card', 'bg-surface-elevated'],
  // shadcn's `accent` is hover gray, NOT our green. Getting this wrong puts
  // the accent on every menu-item hover.
  ['bg-accent', 'bg-surface-hover'],
  ['bg-muted', 'bg-surface-hover'],
  ['bg-border', 'bg-edge-default'],
  ['bg-input', 'bg-surface-elevated'],

  // --- borders and rings
  ['border-destructive', 'border-danger'],
  ['border-input', 'border-edge-default'],
  ['border-border', 'border-edge-default'],
  ['border-ring', 'border-edge-focus'],
  ['ring-ring/50', 'ring-edge-focus'],
  ['ring-ring', 'ring-edge-focus'],
  ['ring-offset-background', 'ring-offset-surface-base'],
  ['ring-destructive', 'ring-danger'],

  // Hardcoded colors are banned in components. Danger needs its own
  // foreground, not the accent's: near-black is 5.39 on dark danger but
  // only 3.25 on light danger, and white is the reverse. `text-on-danger`
  // resolves per theme; both directions are asserted in the contrast
  // contract.
  ['text-white', 'text-on-danger'],

  // Dialogs and menus float ABOVE the page, so they take the raised surface
  // and our elevation token — not the ground and not Tailwind's default.
  ['bg-black/50', 'bg-overlay'],
  // `bg-background` on a dialog means "the app's own surface", but ours is
  // the recessed ground — a floating panel must take the raised one.
  ['rounded-lg border bg-background', 'rounded-lg border bg-surface-elevated'],
  ['shadow-lg', 'shadow-float'],
  ['shadow-md', 'shadow-card'],

  ['fill-primary', 'fill-accent-default'],
  ['stroke-primary', 'stroke-accent-default'],
];

/**
 * Names that must not survive conversion.
 *
 * Deliberately NOT a blanket match on every shadcn-ish word: `text-primary`,
 * `text-muted` and `bg-accent-default` are real tokens in OUR palette, and a
 * regex that flags them would flag the script's own correct output.
 *
 * What is listed here is only what is unambiguously shadcn's:
 *   - `-foreground` names, which our palette has none of
 *   - `bg-/border-/ring-` + a shadcn-only surface word
 *   - bare `bg-accent` / `text-accent` with no step suffix — ours always
 *     carry one (`accent-default`, `accent-hover`, …), so a bare one is
 *     shadcn's hover-gray and resolves to nothing.
 */
const FORBIDDEN = new RegExp(
  [
    // any *-foreground utility
    String.raw`\b[a-z-]*-foreground\b`,
    // shadcn-only surface/semantic words behind a color utility
    String.raw`\b(?:bg|border|ring|fill|stroke|divide|outline)-(?:primary|secondary|destructive|background|card|popover|muted|input|border|ring)(?:\/\d+)?\b`,
    // bare accent with no step — ours always has one
    String.raw`\b(?:bg|text|border|ring)-accent(?![\w-])`,
    // text- variants that are shadcn-only
    String.raw`\btext-destructive\b`,
    // leftover dark: variants
    String.raw`\bdark:`,
  ].join('|'),
  'g',
);

/** Dark-mode variants: the app is dark-first and themed via [data-theme]. */
const _DARK_VARIANT = /\bdark:[^\s"'`]+/g;

/**
 * One pass, longest-key-first.
 *
 * Sequential `replaceAll` calls cascade: `bg-primary` → `bg-accent-default`,
 * and then the later `bg-accent` rule rewrites the substring inside it,
 * yielding `bg-surface-hover-default` — a green button silently turned gray.
 * A single alternation over the whole source cannot re-enter its own output.
 */
function convert(src) {
  const keys = MAP.map(([from]) => from).sort((a, b) => b.length - a.length);
  const lookup = new Map(MAP);
  const pattern = new RegExp(keys.map(escapeRe).join('|'), 'g');

  return (
    src
      .replace(pattern, (m) => lookup.get(m) ?? m)
      // Dark-mode variants: the app is dark-first and themed via [data-theme].
      // Drop the variant and the space that preceded it, so indentation and
      // the surrounding class list are left exactly as they were.
      .replace(/ ?\bdark:[^\s"'`]+/g, '')
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const patterns = args.filter((a) => a !== '--check');

if (patterns.length === 0) {
  console.error('usage: shadcn-detox.mjs [--check] <files...>');
  process.exit(2);
}

const files = patterns.flatMap((p) => (p.includes('*') ? globSync(p) : [p]));

let failed = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  if (check) {
    const hits = [...src.matchAll(FORBIDDEN)].map((m) => m[0]);
    if (hits.length > 0) {
      console.error(`✗ ${file}`);
      for (const h of [...new Set(hits)]) console.error(`    ${h}`);
      failed += 1;
    }
    continue;
  }

  const out = convert(src);
  if (out !== src) {
    writeFileSync(file, out);
    console.log(`rewrote ${file}`);
  } else {
    console.log(`unchanged ${file}`);
  }

  const left = [...new Set([...out.matchAll(FORBIDDEN)].map((m) => m[0]))];
  if (left.length > 0) {
    console.error(`✗ ${file}: unmapped shadcn tokens: ${left.join(', ')}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} file(s) still reference shadcn's palette. These resolve to ` +
      `nothing (or worse, to our gray) — add the mapping to MAP.`,
  );
  process.exit(1);
}

if (check)
  console.log(`✓ ${files.length} file(s) clean of shadcn palette names`);
