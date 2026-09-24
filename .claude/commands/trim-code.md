---
description: Measure a source file's comments against what the code already says, report candidates, then cut
---

Trim the comments in `$ARGUMENTS` — a file or a directory under `apps/` or
`packages/`. If none given, ask which.

Read `docs/CLAUDE.md` first. Its rules are about prose, and a comment is
prose; the filters it applies to a doc apply here with different owners.

Comments only. **Never change behaviour** in this pass.

## 1. Measure before touching anything

Run `node .claude/scripts/code-stats.mjs <path>` — comment-to-code ratio per
file, then candidates by category with line numbers.

The ratio is the point. "Too many comments" is unactionable; "66% of this
file is comment" is a finding, and it is what located the problem the first
time this was done by hand.

## 2. Check what else already says it

For each candidate, ask which of these owns the claim:

- **The code says it.** A well-named function has already said what it does.
  `resolveRate`, `SNAP_MINUTES`, `guard_billed_entry` each carry their comment
  in the name.
- **A type says it.** A Zod schema in `packages/schema` states the shape; a
  `Response<T>` states what comes back. A paragraph restating a type drifts
  from it.
- **A test says it better.** `it('never merges two rates onto one line')`
  states the rule *and* proves it. A comment only asserts.
- **CI enforces it.** `check:type`, `detox`, `tokens:validate`, `verify:schema`,
  `test:ui`. Name the check; never restate what it rejects.
- **A config file owns it.** `ci.yml`, `dependabot.yml`, `biome.jsonc`, the
  tsconfigs carry rationale at the line someone would edit. Grep before
  keeping a paragraph about it.
- **A design doc owns it.** `docs/design/screens/*.html` for one screen,
  `brand.html` for the type and colour rules.
- **`docs/design/principles.md` owns what we believe about the product**,
  **`docs/roadmap.md` owns unbuilt work**, and **a GitHub issue labelled
  `bug` owns a known fault.**

Then the shapes that own nothing:

- **History as justification** — a rule followed by what the old version did.
  The dominant failure mode here: one migration retold across five files. Git
  holds it.
- **Defined by absence** — what the code deliberately does not do.
- **Restating the line below it.**

## 3. Report candidates, then say what you would KEEP

List each with one reason from above. Then name what looks cuttable and is
not, because that is the harder call and the one worth reviewing.

**Density is not the signal; subject matter is.** These are standing
exceptions — they rank high and they stay:

- **DST arithmetic** — `packages/core/src/calendar.ts` and `grid.ts`. A week
  is 167 or 169 hours and nothing in the code shows it.
- **Hydration** — `lib/client/use-theme.ts`. The mismatch is invisible in
  the source and loud in the browser.
- **The `getClaims()` bearer-token note** — `lib/auth.ts`. It fails by
  *succeeding* with no claims, which no test on the injected path reaches.
- **Host-header reasoning** — `proxy.ts`. Why `host` and not
  `nextUrl.hostname` cannot be read off the line.
- **Each test shim's named bug** — `test/shim.mjs`, `test/loader.mjs`.
- **GoTrue and Keychain traps in the Swift** — a `create_user` that must be a
  real bool, `"email"` and not `"magiclink"`, the refresh token that does not
  belong in `UserDefaults`.

The rule underneath: a comment survives if it explains a **trap the code
cannot show**, names a **constraint that is not local** — an invariant held
by an index, a field another language parses — or records **why a non-obvious
approach was taken over the obvious one**. It goes if it narrates history,
describes absence, restates the code, or explains a check.

A match from the script is a candidate, never a verdict. `deadEssay` greps
for the symbol name, so a dynamic import or a string-keyed registry will fool
it — confirm the file is really unreachable before touching it.

## 4. Cut, then verify

- Cut comments; leave every statement, name and type alone.
- **Unbuilt work** moves to `docs/roadmap.md` and a **known fault** to a
  GitHub issue, rather than being deleted.
- `duplicateProse` names the files sharing one explanation. Keep it where it
  is load-bearing, and leave a pointer only if the reader genuinely cannot
  proceed without it — a second copy drifts.
- Re-run `code-stats.mjs` and report before/after.
- Run `pnpm lint`, then the suites covering what you touched: `pnpm test` for
  route handlers, `pnpm test:ui`, `pnpm --filter @stint/core test`. Swift is
  `swift build --package-path apps/macos`.
- **Verify every factual claim you compress.** Check the test exists, the
  script is still in `package.json`, the file is still named that. Do not
  paraphrase into something plausible.

## 5. Report

Before/after ratio, what was cut by category, and anything kept that looked
cuttable — with the reason.
