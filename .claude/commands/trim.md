---
description: Measure a doc for fluff and negation, report candidates, then cut
---

Trim `$ARGUMENTS` (a path under `docs/`; if none given, ask which doc).

Read `docs/CLAUDE.md` first — it holds the rules this command applies.

## 1. Measure before touching anything

Run `node .claude/scripts/doc-stats.mjs <path>`. It reports word count,
negation ratio, and blocks that only restate CI.

The measurement is the point. "Cut the fluff" is unactionable; "59% of blocks
carry a negation" is a finding, and it is what located the real problem the
first time this was done by hand.

## 2. Report candidates, do not cut yet

List each candidate block with one reason drawn from the two filters:

- **Shown** — the page already renders this. A type table setting each role in
  its own role has said "numbers are mono"; a swatch showing one colour has
  said "never two".
- **Enforced** — `check:type`, `detox`, `tokens:validate`, `test:ui` run on
  every push. Naming the mechanism adds words and a second place to drift.
- **Complement** — defines the thing by what it isn't.
- **Sibling pointer** — the index already lists every doc.
- **History** — "used to", "was tried", a decision log.

Then say what you propose to KEEP and why, because that is the harder call.

## 3. Apply judgment, not the regex

A negation survives when it is **contrastive** ("colour belongs to the client,
not the project") or when someone would plausibly do the thing and it would be
**wrong in a way that costs money** ("unbilled and awaiting payment must never
be summed").

When the last pass ran, the regex flagged 7 negations and 5 were correct to
keep. A block matching a pattern is a candidate, never a verdict.

## 4. Cut, then verify

- Rewrite the prose. Measurements move into tables.
- Keep three things per section: what it is, where it goes, and the one thing
  neither a rendering nor a test can say.
- Re-run `doc-stats.mjs` and report before/after.
- For an HTML doc, load it over `pnpm design` (`localhost:8778`) and check it
  renders: no horizontal overflow, no wrapped type specimens, text and section
  rules sharing one left and right edge.
- **Look at the rendered page, not only the numbers.** Geometry checks have
  passed here while the page read as broken.

## 5. Report

Before/after word count and negation ratio, what was cut by category, and
anything you kept that looked cuttable — with the reason.
