---
name: doc-drift
description: Check whether the docs that own what a PR changed still hold, and post one comment on the PR. Run by the Docs workflow; locally, run it on a branch before opening the PR.
argument-hint: "<pr-number> <base-branch> <head-sha>"
allowed-tools: Read, Grep, Glob, Write, Bash(git diff:*), Bash(git log:*), Bash(gh pr comment:*)
---

Check a diff for doc drift: a claim in a doc that the change made false, or
a change that a doc should now describe and does not. `$ARGUMENTS` is a PR
number, its base branch and its head commit; locally, with none, check this
branch against `main` and print the comment instead of posting it.

**Report only.** The one file you write is the comment body.

**In CI, `CLAUDE.md` and `.claude/` are the base branch's copies**: the
action restores them so a PR cannot rewrite its own reviewer's
instructions. The PR's versions are under `.claude-pr/`, so read those when
checking what the PR changed in them.

## 1. Read the change

`git diff <base>...HEAD --stat`, then the diff itself: `<base>` is
`origin/<base-branch>` in CI and `main` locally. List the
**behavior** it changes: an endpoint, a field, a default, a rule, a screen,
a command, a script. A rename, a refactor or a test-only change alters no
behavior, so it has nothing to drift from.

Nothing changed behavior → go to step 4 with no findings.

## 2. Find the doc that owns each change

`CLAUDE.md`'s table says which doc owns which kind of claim. In short:

| The change touches | Its owner |
| --- | --- |
| a `/api/v1/*` route | `docs/api.md` |
| a table, column or migration | `docs/data-model.md` |
| a screen | its doc in `docs/design/screens/` |
| running, building or deploying | `docs/local-dev.md`, `docs/deploying.md`, `docs/setup.md` |
| a rule true only under one path | the `.claude/rules/*.md` whose `paths:` match |
| a CI workflow | `docs/deploying.md` |
| a `pnpm` script | `docs/local-dev.md`, `README.md` |
| a repo-wide constraint | `CLAUDE.md` |
| what a user sees, or how their data is treated | `docs/design/principles.md` |
| who it is for, what it costs, what it replaces | `docs/positioning.md` |

Grep `docs/`, `README.md`, the `CLAUDE.md` files and `.claude/` for the
names the diff touched as well: a function, route, column or script named
there is a claim about it. `specs/` is Spec Kit's record of past features;
leave it out.

## 3. Check each claim against the new code

For each claim, find a finding when:

- **it is false now**: the doc says something the new code contradicts
- **it breaks a principle**: the change does what `principles.md`,
  `positioning.md` or `CLAUDE.md`'s non-negotiables rule out, such as
  correcting a suspect record on the user's behalf
- **it is missing**: a new endpoint absent from `api.md`, or one the PR
  implemented that is still marked `(not implemented)`; a new column absent
  from `data-model.md`
- **it points at nothing**: a file, script or `pnpm` command named in a doc
  that the PR removed or renamed

Verify each against the code before reporting it. Report only drift this
diff caused: a stale claim about code the PR did not change is out of
scope.

## 4. Post one comment

Write the body to `drift-comment.md`, then:

    gh pr comment <number> --edit-last --create-if-none --body-file drift-comment.md

`--edit-last` updates the comment on each push instead of adding one. A
file, not `--body`, because the body is full of backticks the shell would
run.

The body's first line is `<!-- doc-drift:<head-sha> -->`, exactly:
`/work-issues` reads it to know the comment is about the current commit.
Then `### Doc drift` and, with findings, one line each:

    - `docs/api.md:142`: says `PATCH /entries/:id` rejects a running entry; `route.ts:88` now accepts it and stops the timer.

With none, `None found.`
