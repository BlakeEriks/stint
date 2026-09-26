---
name: doc-drift
description: Check whether the docs that own what a PR changed still hold, and post one comment on the PR. Run by the Docs workflow; locally, run it on a branch before opening the PR.
argument-hint: "<pr-number> <base-branch>"
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(gh pr comment:*)
---

Check a diff for doc drift: a claim in a doc that the change made false, or
a change that a doc should now describe and does not. `$ARGUMENTS` is a PR
number and its base branch; locally, with none, check this branch against
`main` and print the comment instead of posting it.

**Report only.** Edit no file.

## 1. Read the change

`git diff <base>...HEAD --stat`, then the diff itself: `<base>` is
`origin/<base-branch>` in CI and `main` locally. List the
**behaviour** it changes: an endpoint, a field, a default, a rule, a screen,
a command, a script. A rename, a refactor or a test-only change alters no
behaviour, so it has nothing to drift from.

Nothing changed behaviour → go to step 4 with no findings.

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

Grep `docs/`, `README.md`, the `CLAUDE.md` files and `.claude/` for the
names the diff touched as well: a function, route, column or script named
there is a claim about it. `specs/` is Spec Kit's record of past features;
leave it out.

## 3. Check each claim against the new code

For each claim, find a finding when:

- **it is false now**: the doc says something the new code contradicts
- **it is missing**: a new endpoint absent from `api.md`, or one the PR
  implemented that is still marked `(not implemented)`; a new column absent
  from `data-model.md`
- **it points at nothing**: a file, script or `pnpm` command named in a doc
  that the PR removed or renamed

Verify each against the code before reporting it. Report only drift this
diff caused: a stale claim about code the PR did not change is out of
scope.

## 4. Post one comment

`gh pr comment <number> --edit-last --create-if-none --body "<body>"`, so a push
updates the comment instead of adding one.

With findings, the body is `### Doc drift` and one line each:

    - `docs/api.md:142`: says `PATCH /entries/:id` rejects a running entry; `route.ts:88` now accepts it and stops the timer.

With none, the body is `### Doc drift\nNone found.`
