---
name: reduce
description: Reduce a source file or directory back to a simple form (complexity, duplication, dead code, comments) without changing behavior. Use when a hygiene issue says "Fix with /reduce", or a file has grown hard to follow.
argument-hint: "<path>"
---

Reduce `$ARGUMENTS` without changing what it does. If no path is given, ask
which.

## 1. Measure

`pnpm hygiene $ARGUMENTS` lists what the standard tools report, with debt in
minutes:

| Finding | Tool | Standard |
| --- | --- | --- |
| complexity | Biome | SonarSource Cognitive Complexity, 15 per function |
| duplication | jscpd | blocks of 100+ tokens |
| dead-code | Knip | unused files, exports, dependencies |

`--json` adds each finding's line. Record the debt: it is the before number.

## 2. Pin the behavior

Find the tests that exercise each function you will change. A function
with none gets a characterization test first (Feathers, *Working
Effectively with Legacy Code*): call it with representative inputs and
assert what it returns today, then confirm the test fails when you break
the function. The refactor is safe only if the tests prove it.

## 3. Refactor

Use Fowler's catalog (*Refactoring*, 2nd ed.). The moves that reduce
cognitive complexity:

- **Extract Function** for each block with its own purpose; its name
  replaces a comment
- **Replace Nested Conditional with Guard Clauses**: nesting is what the
  metric charges most for
- **Decompose Conditional** when a condition needs reading twice
- **Split Loop** when one loop does two jobs

For duplication, **Extract Function** into the module both copies can
import. Two copies that only look alike and will change for different
reasons stay apart.

For dead code, **Remove Dead Code**. First grep for the name: Knip cannot
see a dynamic import or a string-keyed lookup.

## 4. Comments

The standard is Ousterhout, *A Philosophy of Software Design* (ch. 12–13):
a comment says what the code cannot.

| Keep | Cut |
| --- | --- |
| why this approach over the obvious one | what the next line does |
| a constraint held elsewhere: an index, a trigger, another client | how the code got this way; git holds it |
| a trap invisible in the source: DST, hydration, a vendor quirk | what the code deliberately does not do |
| units, invariants, the meaning of a return value | a restatement of a type, a test or a CI check |

A function extracted in step 3 often makes its old comment redundant.

## 5. Verify

- `pnpm hygiene $ARGUMENTS` again: debt went down, nothing new appeared
- `pnpm lint`, `pnpm typecheck`, and the suites covering what you touched
  (`CLAUDE.md` and `.claude/rules/testing.md` name them)
- a changed component has been seen in the running app

Report the debt before and after, each refactor in one line, and anything
left in place with the reason.
