#!/usr/bin/env node
/**
 * Measures a source file's comments: how much prose sits on top of the code,
 * and how much of it the code, a test or CI already says.
 *
 * The sibling of `doc-stats.mjs`, and it exists for the same reason: "too
 * many comments" is unactionable. The survey that prompted this found files
 * at 66%, 64%, 55%, 54% and 51% comment-to-code, which is a number, which is
 * what made it fixable. That ratio is the headline.
 *
 * Every match here is a CANDIDATE, never a verdict. A comment naming a trap
 * the code cannot show — DST arithmetic, a hydration mismatch, GoTrue
 * refusing a typed code — earns its density, and no regex can tell that from
 * a paragraph narrating a migration. Subject matter is the signal, not size.
 *
 * Languages: .ts .tsx .mjs .js .swift (// and /* *\/), .sql (--), .css (/* *\/).
 *
 * Known blind spots — the scanner is a character walk, not a parser:
 *   - Template literals are tracked, but `${...}` nesting is only one deep.
 *   - A regex literal is guessed from the preceding token; `a = b / c // d`
 *     style division against a variable can misread. Rare, and it only ever
 *     costs a false negative.
 *   - JSX text is not string-quoted, so a literal `//` or `--` written as page
 *     copy inside a tag would count as a comment. Nothing in this repo does.
 *   - Swift nested block comments and raw strings (#"..."#) are not modelled.
 *   - SQL dollar-quoted bodies ($$ … $$) are treated as code, so comments
 *     inside a function body are counted. That is what we want.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: code-stats.mjs <path> [<path>...]   (file or directory)');
  process.exit(1);
}

const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.swift', '.sql', '.css']);

/* Vendored or generated. `components/ui` is shadcn rewritten by
   `shadcn-detox.mjs` — its comments are upstream's, not ours to trim. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  '.git',
]);
const SKIP_PATHS = ['apps/web/src/components/ui'];

/* ---------------------------------------------------------------- scanning */

/**
 * Split a source file into comment lines and code lines.
 *
 * Returns comment BLOCKS (consecutive comment lines, joined) with the line
 * number they start at, because a block is the unit a human judges — a
 * fourteen-line header is one decision, not fourteen.
 */
function scan(src, ext) {
  const lineComment = ext === '.sql' ? '--' : '//';
  const blockComments = ext !== '.sql';
  const kind = new Array(src.split('\n').length).fill('blank');
  const text = new Array(kind.length).fill('');

  let i = 0;
  let line = 0;
  let state = 'code';
  let quote = '';

  const mark = (k) => {
    if (k === 'comment' && kind[line] === 'code') return;
    if (k === 'code') kind[line] = 'code';
    else if (kind[line] !== 'code') kind[line] = 'comment';
  };

  /* A `/` opens a regex only where a value may begin. Checking the last
     non-space character is enough: after an identifier, `)` or a literal it
     is division; after `(`, `,`, `=`, `return` and friends it is a regex. */
  const regexCanStart = (upto) => {
    const before = upto.replace(/\s+$/, '');
    if (!before) return true;
    const last = before[before.length - 1];
    if ('([{,;:=!&|?+-*%~^<>'.includes(last)) return true;
    return /\b(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/.test(
      before,
    );
  };

  let lineStart = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === '\n') {
      line++;
      lineStart = i + 1;
      i++;
      if (state === 'lineComment') state = 'code';
      // A block comment's continuation lines are comment lines too.
      else if (state === 'blockComment') mark('comment');
      continue;
    }

    if (state === 'lineComment' || state === 'blockComment') {
      text[line] += c;
      if (state === 'blockComment' && c === '*' && src[i + 1] === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (state === 'string') {
      mark('code');
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote) state = 'code';
      i++;
      continue;
    }

    if (state === 'template') {
      mark('code');
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') state = 'code';
      i++;
      continue;
    }

    if (state === 'regex') {
      mark('code');
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '[') state = 'regexClass';
      else if (c === '/') state = 'code';
      i++;
      continue;
    }

    if (state === 'regexClass') {
      mark('code');
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === ']') state = 'regex';
      i++;
      continue;
    }

    // state === 'code'
    if (src.startsWith(lineComment, i)) {
      state = 'lineComment';
      mark('comment');
      i += lineComment.length;
      continue;
    }
    if (blockComments && c === '/' && src[i + 1] === '*') {
      state = 'blockComment';
      mark('comment');
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      state = 'string';
      quote = c;
      mark('code');
      i++;
      continue;
    }
    if (c === '`' && ext !== '.sql' && ext !== '.css') {
      state = 'template';
      mark('code');
      i++;
      continue;
    }
    if (
      c === '/' &&
      ext !== '.css' &&
      ext !== '.sql' &&
      regexCanStart(src.slice(lineStart, i))
    ) {
      state = 'regex';
      mark('code');
      i++;
      continue;
    }
    if (!/\s/.test(c)) {
      mark('code');
    }
    i++;
  }

  const blocks = [];
  let open = null;
  kind.forEach((k, n) => {
    if (k === 'comment') {
      if (!open) open = { line: n + 1, parts: [] };
      open.parts.push(text[n]);
    } else if (open) {
      blocks.push(finish(open));
      open = null;
    }
  });
  if (open) blocks.push(finish(open));

  return {
    total: kind.length,
    code: kind.filter((k) => k === 'code').length,
    comment: kind.filter((k) => k === 'comment').length,
    blocks,
  };
}

function finish(open) {
  const raw = open.parts.join('\n');
  const prose = raw
    .split('\n')
    .map((l) => l.replace(/^\s*[*/-]*\s?/, '').replace(/\*+\/\s*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { line: open.line, lines: open.parts.length, text: prose };
}

/* ---------------------------------------------------------------- patterns */

/* Carried over from doc-stats where the shape transfers, retuned where code
   differs from prose.
 *
 * A PROHIBITION opens with the negation — "Never recompute a PDF." That is
 * the shape that accumulates, each one someone's past decision written as a
 * rule. A contrastive negation mid-sentence is doing real work and is not
 * flagged; matching it produced mostly false positives in the docs and would
 * here too. */
const PATTERNS = {
  prohibition:
    /(^|[.;—]\s+)(never\b|no\b|do not\b|don't\b|avoid\b|it never\b|cannot be\b|must not\b)/i,

  /* The dominant failure mode in this repo: one migration retold across five
     files. Git holds the history; a comment states the current form. */
  history:
    /\b(used to|previously|was tried|tried first|an earlier|earlier version|this replaces|had already|had been|shipped once|first draft|was wrong|we tried|no longer\s+(does|did|has|needs?)|originally|before this|the old\b)\b/i,

  /* Describing what the code deliberately does not do. Reads as scope, is
     actually absence — nothing here to maintain against. */
  byAbsence:
    /(—|,|:)\s*(no [a-z]+[a-z, ]*\b(and|,|—)|not by |without having to|there is no\b|and nothing else\b)/i,

  /* Naming a check is wanted ("`pnpm detox` is the only enforcement").
     RESTATING what it rejects is the bloat, and that reads as a long block
     that also mentions the check — so this fires on length, not the mention. */
  ciRestated:
    /\b(exit 0|check:type|shadcn-detox|\bdetox\b|tokens:validate|verify:schema|pnpm lint|biome|runs in CI|CI rejects|CI guards|the CI)\b/,
};

/* A block mentioning a check is a candidate only when it is long enough to be
   explaining the check rather than naming it. doc-stats' threshold, unchanged
   — the comments that tripped it here were the same length as the docs'. */
const CI_RESTATE_WORDS = 45;

/* A header this long is an essay. Ten lines was the survey's own cut: the two
   unreachable components found by hand carried 14 and 19. */
const ESSAY_LINES = 10;

/* Below this a block is a label ("// Apex: `/` is the landing page."), not
   prose worth diffing against another file. */
const DUP_MIN_CHARS = 90;

/* Share of the shorter block's distinctive words that both must carry.
 *
 * Exact matching found nothing: the retellings in this repo are paraphrases,
 * not copy-paste — the rounding rule is stated five times in five different
 * sentences. Tuned by reading the output: 0.5 chained fourteen blocks that
 * merely shared this domain's vocabulary (project, client, colour, rate) into
 * one meaningless group. 0.65 keeps the real retellings and drops those. */
const DUP_SIMILARITY = 0.65;

/* Words too common to make two blocks about the same thing. Without this,
   every long comment overlaps every other. */
const STOPWORDS = new Set(
  `a an and are as at be because been but by can could do does for from had has have
   how if in into is it its not of on one only or over own same so some such than that
   the their them then there these they this those through to under until up via was
   what when where which while who why will with would you your it's its there's`.split(
    /\s+/,
  ),
);

const distinctive = (text) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );

function similarity(a, b) {
  const small = a.size <= b.size ? a : b;
  const large = small === a ? b : a;
  if (!small.size) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

/* ------------------------------------------------------- the dead-essay check */

/**
 * A large header on a file whose exports nothing imports.
 *
 * The highest-value check, because prose is what keeps an unreachable file
 * alive: two of the worst offenders in this repo were components imported
 * nowhere, each carrying a header explaining a design no screen rendered.
 *
 * HEURISTIC, and it says so in the output: the import check is a grep for the
 * symbol name across the repo, so a dynamic `import()` built from a string, a
 * registry keyed by name, or a re-export barrel would all fool it. It is a
 * prompt to look, not a finding.
 */
function exportedSymbols(src, ext) {
  if (ext === '.sql' || ext === '.css') return [];
  const names = new Set();
  const add = (n) => n && n !== 'default' && names.add(n);
  for (const m of src.matchAll(
    /\bexport\s+(?:async\s+)?(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  ))
    add(m[1]);
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g))
    for (const part of m[1].split(','))
      add(part.split(/\s+as\s+/).pop().trim());
  // Swift: a type or function another module could reach.
  if (ext === '.swift')
    for (const m of src.matchAll(
      /\b(?:public|internal)?\s*(?:struct|class|enum|func)\s+([A-Za-z_][\w]*)/g,
    ))
      add(m[1]);
  return [...names];
}

/* Next reaches these by file path, never by name, so "nothing imports it" is
   always true and always meaningless. Same for a package's own entry point.
   Without this exemption every layout and route in the app read as dead, which
   is the shape of a checker nobody would run twice. */
const FRAMEWORK_FILES =
  /(^|\/)(layout|page|route|error|global-error|not-found|loading|template|default|opengraph-image|icon|sitemap|robots|middleware|proxy|instrumentation)\.[jt]sx?$/;

/* A script is run by `node`, not imported, so "nothing imports it" is true of
   every one of them. `scripts/` and a shebang both say so. */
const frameworkEntry = (path, src) => {
  const r = relative(ROOT, path);
  return (
    FRAMEWORK_FILES.test(r) ||
    /(^|\/)src\/index\.[jt]sx?$/.test(r) ||
    /(^|\/)scripts\//.test(r) ||
    src.startsWith('#!')
  );
};

const grepCache = new Map();

function importedElsewhere(symbol, selfPath) {
  if (!grepCache.has(symbol)) grepCache.set(symbol, filesNaming(symbol));
  return grepCache.get(symbol).some((f) => f !== selfPath);
}

function filesNaming(symbol) {
  try {
    const out = execFileSync(
      'grep',
      [
        '-rl',
        '--include=*.ts',
        '--include=*.tsx',
        '--include=*.mjs',
        '--include=*.js',
        '--include=*.swift',
        '--exclude-dir=node_modules',
        '--exclude-dir=dist',
        '--exclude-dir=.next',
        '--exclude-dir=coverage',
        '-w',
        symbol,
        ROOT,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- walking files */

function walk(path, out) {
  let st;
  try {
    st = statSync(path);
  } catch {
    console.error(`skipped, not found: ${relative(ROOT, path)}`);
    return out;
  }
  if (st.isFile()) {
    if (EXTS.has(extname(path))) out.push(path);
    return out;
  }
  const rel = relative(ROOT, path);
  if (SKIP_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`))) return out;
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(join(path, name), out);
  }
  return out;
}

const files = [];
for (const a of args) walk(resolve(a), files);
files.sort();

/* ----------------------------------------------------------------- analysis */

const results = [];
const candidates = [];

for (const path of files) {
  const src = readFileSync(path, 'utf8');
  const ext = extname(path);
  const { total, code, comment, blocks } = scan(src, ext);
  /* Comments as a share of the lines that are not blank — the basis the
     original survey used, so its 66% and this script's mean the same thing.
     Dividing by code lines alone reads past 100% on a file that is mostly
     header, which is a true number and a useless headline. */
  const ratio = comment + code ? Math.round((100 * comment) / (comment + code)) : 0;

  const hit = {};
  for (const k of Object.keys(PATTERNS)) hit[k] = [];
  for (const b of blocks) {
    if (b.text.length < 25) continue;
    for (const [k, re] of Object.entries(PATTERNS)) {
      if (!re.test(b.text)) continue;
      if (k === 'ciRestated' && b.text.split(/\s+/).length < CI_RESTATE_WORDS)
        continue;
      hit[k].push(b);
    }
    if (b.text.length >= DUP_MIN_CHARS)
      candidates.push({ path, line: b.line, text: b.text, words: distinctive(b.text) });
  }

  // deadEssay: a big header whose exports nothing else names.
  const essays = blocks.filter((b) => b.lines >= ESSAY_LINES);
  let dead = null;
  if (essays.length && !frameworkEntry(path, src)) {
    const symbols = exportedSymbols(src, ext);
    if (symbols.length) {
      const unreferenced = symbols.filter((s) => !importedElsewhere(s, path));
      if (unreferenced.length === symbols.length)
        dead = { symbols, lines: essays.reduce((n, b) => n + b.lines, 0) };
    }
  }

  results.push({ path, total, code, comment, ratio, blocks, hit, dead });
}

/* duplicateProse: one explanation told again in another file.
 *
 * Grouped greedily — a block joins the first group it is similar enough to,
 * so a chain of five paraphrases lands as one finding rather than ten pairs.
 * Quadratic, but over a few hundred long blocks that is milliseconds. */
const groups = [];
for (const c of candidates) {
  const home = groups.find(
    (g) => similarity(g.words, c.words) >= DUP_SIMILARITY,
  );
  if (home) home.members.push(c);
  else groups.push({ words: c.words, members: [c] });
}

/* One hit per file: the same explanation twice in one file is a different
   problem, and listing it three times buries the files that matter. */
const dupes = groups
  .map((g) => {
    const seen = new Set();
    const members = g.members.filter(
      (m) => !seen.has(m.path) && seen.add(m.path),
    );
    return { ...g, members };
  })
  .filter((g) => g.members.length > 1)
  .sort((a, b) => b.members.length - a.members.length);

/* -------------------------------------------------------------- the report */

const snip = (s, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);
/* Repo-relative where that is shorter; absolute otherwise, so a path outside
   the repo does not print as a stack of `../`. */
const rel = (p) => {
  const r = relative(ROOT, p);
  return r.startsWith('..') ? p : r;
};

const ranked = [...results].sort((a, b) => b.ratio - a.ratio);
const noisy = ranked.filter(
  (r) =>
    r.ratio >= 30 ||
    r.dead ||
    Object.values(r.hit).some((l) => l.length) ,
);

console.log(
  `\n${results.length} files — ${results.reduce((n, r) => n + r.comment, 0)} comment lines over ${results.reduce((n, r) => n + r.code, 0)} code lines\n`,
);

console.log('  ratio  comment/code  file');
for (const r of ranked.slice(0, 20))
  console.log(
    `  ${String(`${r.ratio}%`).padStart(5)}  ${String(`${r.comment}/${r.code}`).padStart(12)}  ${rel(r.path)}${r.ratio >= 50 ? '  ← look' : ''}`,
  );
if (ranked.length > 20) console.log(`  …and ${ranked.length - 20} more files`);

for (const r of noisy) {
  const lines = [];
  for (const k of ['prohibition', 'history', 'byAbsence', 'ciRestated'])
    for (const b of r.hit[k])
      lines.push(`    ${k.padEnd(11)} :${String(b.line).padEnd(4)} ${snip(b.text)}`);
  if (r.dead)
    lines.push(
      `    deadEssay   ${String(r.dead.lines).padEnd(5)} ${r.dead.lines} comment lines; nothing imports ${r.dead.symbols.slice(0, 4).join(', ')}`,
    );
  if (!lines.length) continue;
  console.log(`\n${rel(r.path)}  (${r.ratio}%)`);
  for (const l of lines.slice(0, 14)) console.log(l);
  if (lines.length > 14) console.log(`    …and ${lines.length - 14} more`);
}

if (dupes.length) {
  console.log(
    `\n— duplicateProse — ${dupes.length} explanation(s) told in 2+ files`,
  );
  for (const d of dupes.slice(0, 8)) {
    console.log(`\n  ${d.members.length}×  ${snip(d.members[0].text, 110)}`);
    for (const m of d.members) console.log(`      ${rel(m.path)}:${m.line}`);
  }
  if (dupes.length > 8) console.log(`\n  …and ${dupes.length - 8} more`);
}

console.log(
  '\nEvery line above is a CANDIDATE. A comment naming a trap the code cannot' +
    '\nshow — DST arithmetic, a hydration mismatch, a GoTrue field that must be' +
    '\na real bool — earns its density. deadEssay greps for the symbol name, so' +
    '\na dynamic import or a string-keyed registry will fool it: look, do not' +
    '\ndelete on the strength of it. Judgment, not the regex.\n',
);
