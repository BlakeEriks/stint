#!/usr/bin/env node
/**
 * Fails a source comment that cites an issue or PR (`#191`): the story of a
 * change belongs in its commit and PR (`.claude/rules/comments.md`).
 * `TODO(#125)` is allowed, since it points at work still to do. Migrations
 * are exempt: each is a change record, and an applied one is never edited.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', 'apps', 'packages', 'scripts'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx|mjs|js|swift)$/.test(f) && !/\/dist\//.test(f));

/* Up to four digits, so a hex color (`#457036`) is not an issue. */
const REF = /(^|[\s(])(?<!TODO\()#\d{1,4}\b/;
const COMMENT = /\/\/.*|\/\*[\s\S]*?\*\//g;

let bad = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(COMMENT)) {
    m[0].split('\n').forEach((text, i) => {
      if (!REF.test(text)) return;
      const line = src.slice(0, m.index).split('\n').length + i;
      console.error(`${file}:${line}  ${text.trim()}`);
      bad += 1;
    });
  }
}

if (bad > 0) {
  console.error(
    `\n${bad} comment(s) cite an issue. Say what the code needs, not how it got here.`,
  );
  process.exit(1);
}
console.log(`comment refs: clean (${files.length} files)`);
