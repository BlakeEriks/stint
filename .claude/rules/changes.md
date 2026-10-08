---
paths:
  - "apps/**"
  - "packages/**"
  - "scripts/**"
  - "supabase/**"
---

## Making a change

The same for every change, from `/work-issues` or Spec Kit.

**Make the change easy, then make the easy change** (Beck; Fowler's
preparatory refactoring). Where a change would be a special case the design
doesn't expect, or would copy a mechanism the code already has, refactor
first, in its own commit, so the change needs no special case. A copied
pattern is extracted into one shared component or function, and the
original moves onto it in the same change: a second copy is the one that
drifts. A redesign wider than the change is Blake's: file a `Redesign <area>`
issue naming what points to it and the design you'd move to.

**Tests follow Constitution V.** Before writing one, name the regression it
guards that nobody would see. A change to how a screen looks or reads has
none: its story is the test, with a `play` that fails without the change,
and no jsdom test asserts it.

**Leave no new debt.** Before verifying, run `pnpm hygiene` on each file the
change touched. A finding in code the change wrote is reduced now, by
`/reduce`'s steps; one already on `main` is left to its own issue.
