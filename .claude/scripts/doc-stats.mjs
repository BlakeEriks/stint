#!/usr/bin/env node
/**
 * Measures a doc's prose: how much there is, and how much of it is defining
 * the thing by what it isn't.
 *
 * Exists because "cut the fluff" is unactionable. The first manual pass over
 * these docs found ~60% of blocks carried a negation — a number, which is
 * what made it fixable. Every match here is a CANDIDATE, never a verdict:
 * "colour belongs to the client, not the project" is contrastive and
 * load-bearing, and no regex can tell that from "never uppercase".
 *
 * Handles HTML (<p>/<li>) and Markdown (paragraphs and list items).
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: doc-stats.mjs <doc> [<doc>...]');
  process.exit(1);
}

/* Tuned to what actually needed cutting, not to every "not" in the file.
 *
 * A PROHIBITION opens with the negation — "Never green.", "It never assembles
 * one." That is the shape that piles up, because each one is someone's past
 * decision written as a rule. A CONTRASTIVE negation buries it mid-sentence
 * ("colour belongs to the client, not the project") and is doing real work,
 * so it is not flagged: matching it produced mostly false positives and a
 * checker nobody reads. */
const PATTERNS = {
  prohibition:
    /(^|[.;—]\s+)(never\b|no\b|do not\b|don't\b|avoid\b|it never\b|cannot be\b|must not\b)/i,
  /* Naming a check is fine and wanted ("CI rejects anything off the scale").
   * What bloats is RESTATING what it rejects, which reads as a long block that
   * also mentions the check — so this fires on length, not on the mention. */
  ciRestated:
    /\b(exit 0|check:type|shadcn-detox|\bdetox\b|tokens:validate|runs in CI|CI rejects|CI guards)\b/,
  history:
    /\b(used to|previously|was tried|tried first|an earlier|this replaces|had already|shipped once|first draft|was wrong|which is how|only found by)\b/i,
  /* "…over a plain Postgres connection — no CLI, no pasting SQL into a
   * dashboard" describes two workflows we do not have. */
  byAbsence:
    /(—|,)\s*(no [a-z]+[a-z, ]*\b(and|,|—)|not by |without having to)/i,
  sibling: /\b(see|in|is)\s+<?code>?(menubar|landing|brand)\.html/i,
};

/* A block mentioning a check is only a candidate when it is long enough to be
 * explaining the check rather than naming it. */
const CI_RESTATE_WORDS = 45;

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function blocksOf(src, ext) {
  if (ext === '.html') {
    const body = src
      .replace(/<style>[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    return [...body.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .map((m) => clean(m[2]))
      .filter((t) => t.length > 40);
  }
  // Markdown: blank-line separated, minus fences and headings.
  return src
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .replace(/^[#>\-*\d.]+\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((t) => t.length > 40);
}

let worst = 0;

for (const path of paths) {
  const src = readFileSync(path, 'utf8');
  const blocks = blocksOf(src, extname(path));
  const words = blocks.reduce((n, b) => n + b.split(/\s+/).length, 0);

  const hit = {};
  for (const k of Object.keys(PATTERNS)) hit[k] = [];
  for (const b of blocks)
    for (const [k, re] of Object.entries(PATTERNS)) {
      if (!re.test(b)) continue;
      // A short block naming a check is the good shape; skip it.
      if (k === 'ciRestated' && b.split(/\s+/).length < CI_RESTATE_WORDS)
        continue;
      hit[k].push(b);
    }

  const pct = (n) =>
    blocks.length ? Math.round((100 * n) / blocks.length) : 0;
  const negPct = pct(hit.prohibition.length);
  worst = Math.max(worst, negPct);

  console.log(`\n${basename(path)}`);
  console.log(`  ${words} words in ${blocks.length} blocks`);
  console.log(
    `  prohibition ${String(hit.prohibition.length).padStart(3)}  ${String(negPct).padStart(3)}%  ${negPct > 25 ? '← over 25%, look at these' : 'ok'}`,
  );
  for (const k of ['ciRestated', 'history', 'byAbsence', 'sibling'])
    if (hit[k].length)
      console.log(`  ${k.padEnd(11)} ${String(hit[k].length).padStart(3)}`);

  for (const [k, list] of Object.entries(hit)) {
    if (!list.length) continue;
    if (k === 'prohibition' && negPct <= 25) continue;
    console.log(`\n  — ${k} —`);
    for (const b of list.slice(0, 12)) console.log(`    ${b.slice(0, 150)}`);
    if (list.length > 12) console.log(`    …and ${list.length - 12} more`);
  }
}

console.log(
  '\nEvery line above is a CANDIDATE. A contrastive negation ("client, not' +
    '\nproject") or one preventing a costly mistake ("unbilled and awaiting' +
    '\npayment must never be summed") stays. Judgment, not the regex.\n',
);
