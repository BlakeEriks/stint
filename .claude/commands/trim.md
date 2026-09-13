---
description: Measure a doc for fluff and negation, report candidates, then cut
---

Trim `$ARGUMENTS` — a path under `docs/`, or `CLAUDE.md` itself. If none
given, ask which.

Read `docs/CLAUDE.md` first; it holds the rules this command applies.

## 1. Measure before touching anything

Run `node .claude/scripts/doc-stats.mjs <path>` — word count, blocks opening
with a prohibition, blocks restating CI, history markers.

The measurement is the point. "Cut the fluff" is unactionable; "59% of blocks
carry a negation" is a finding, and it is what located the real problem the
first time this was done by hand.

## 2. Check what else already says it

For each candidate block, ask which of these owns the claim:

- **The page shows it** — a type table setting each role in its own role has
  said "numbers are mono"; a swatch showing one colour has said "never two".
- **CI enforces it** — `check:type`, `detox`, `tokens:validate`, `test:ui`.
  Name the check, never restate what it rejects.
- **A config file owns it** — `ci.yml`, `dependabot.yml`, `biome.jsonc`, the
  tsconfigs all carry rationale in comments at the line someone would edit.
  Grep the config before keeping a paragraph about it. The TS6/TS7 section was
  229 words duplicating three files.
- **A screen doc owns it** — `docs/design/screens/*.html`. `CLAUDE.md` keeps
  only what constrains code repo-wide.

Then two shapes that own nothing and always go:

- **Defined by absence** — "no CLI, no pasting SQL into a dashboard".
- **History as justification** — a rule followed by what the old version did.

## 3. Report candidates, then say what you would KEEP

List each with one reason from above. Then name what looks cuttable and is
not, because that is the harder call and the one worth reviewing.

A negation survives when it is **contrastive** ("colour belongs to the client,
not the project") or when someone would plausibly do the thing and it would be
**wrong in a way that costs money** ("unbilled and awaiting payment must never
be summed"). The regex flagged 7 and 5 were right to keep — a match is a
candidate, never a verdict.

## 4. Cut, then verify

- Rewrite the prose; measurements move into tables.
- Keep: what it is, where it goes, and the one thing nothing else can say.
- Re-run `doc-stats.mjs` and report before/after.
- **Verify every factual claim you compress.** Compressing "tests still
  passing" onto two components was wrong — one had no test. Check, do not
  paraphrase into something plausible.
- For an HTML doc, load it over `pnpm design` and check it renders: no
  horizontal overflow, no wrapped type specimens, text and section rules
  sharing one left and right edge.
- **Look at the rendered page, not only the numbers.** Geometry checks have
  passed here while the page read as broken.
- For `CLAUDE.md`, confirm no dangling file references and that every `pnpm`
  script named still exists.

## 5. Report

Before/after word count and prohibition ratio, what was cut by category, and
anything kept that looked cuttable — with the reason.
