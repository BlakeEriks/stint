---
description: Work through open GitHub issues one at a time, to an open PR each, stopping only for what needs Blake
---

Work open issues on `BlakeEriks/stint` one at a time, each to an open PR.
Blake merges; merging is the deploy, so **never merge, and never touch
production**. Run under `/loop` to keep going across sessions. `$ARGUMENTS`,
if given, names the issues to work, in that order.

## 0. Clear what Blake merged

For each worktree from `git worktree list` whose PR is merged:
`git worktree remove <path>`, then `git branch -d <branch>`, and stop its dev
server. A worktree with uncommitted changes is not yours to remove — say so in
the summary.

## 1. Pick

`gh issue list --state open --json number,title,labels,body,comments`, then
skip every issue that:

- is labelled `needs-input` with no reply from Blake since the label went on
- already has an open PR (`gh pr list --search "#<n>"`)
- depends on an unmerged PR

Take the worst first: `wrong data`, then `misleading`, then `looks wrong`,
then `enhancement`; oldest first within a label. None left → go to step 5.

## 2. Triage — does this need Blake?

Read the issue, its comments, and the docs that own the area it touches.
It needs Blake when it:

- decides a price, a thesis, a scope or a milestone (`docs/positioning.md`,
  `docs/roadmap.md`)
- is a new capability, so needs a spec before building
- touches production data, backups or the release gate
- has two fixes the docs do not choose between, and picking wrong would cost
  more than a revision

Anything else, decide yourself and put the reasoning in the PR. When it does
need Blake: comment one specific question on the issue, with the options and
your recommendation, add the `needs-input` label, and go back to step 1.

## 3. Build

`pnpm worktree <branch>`, then fix it there with tests, following
`CLAUDE.md` and the `.claude/rules/` the change touches. Before calling it
done:

- `pnpm lint`, `pnpm typecheck` and the suites the change affects pass
- a web change has been seen signed in to local Stint on the worktree's own
  dev server, left running on its own port
- a macOS change builds and has been seen in the app

If a check cannot pass without Blake, treat it as step 2's `needs-input`, with
the branch pushed so the work survives.

## 4. Ship

Commit, push, and `gh pr create` with `Closes #<n>`, what changed, how it
was verified, and any call you made that Blake might make differently. Back
to step 1.

## 5. Stop

When no issue is left to pick, end with one summary: PRs opened, issues now
`needs-input` with their question, and anything that failed. Under `/loop`,
wake again in an hour to pick up Blake's replies and merges.
