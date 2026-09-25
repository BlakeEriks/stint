---
description: Work through open GitHub issues one at a time, to an open PR each, stopping only for what needs Blake
---

Work open issues on `BlakeEriks/stint` one at a time, each to an open PR
Blake can test from its preview link. Blake merges; merging is the deploy, so
**never merge, and never touch production**. Run under `/loop` to keep going.
`$ARGUMENTS`, if given, names the issues to work, in that order.

All work happens in one long-lived worktree, `../stint-issues`, switching
branches there. Make it with `pnpm worktree issues` the first time; after
that, `git switch -c <branch> origin/main` inside it and `pnpm install` when
the lockfile moved.

## 0. Catch up

- **Merged:** delete the local branch of every PR Blake merged
  (`git branch -d`).
- **Feedback first:** for every open PR of yours, a comment or review from
  Blake newer than your last push is feedback. Address it on that branch
  before picking anything new: change, verify, push, then reply on the PR
  with what changed and an updated **Try it**. Feedback beyond the PR's scope
  becomes a new issue, linked in the reply. A question back gets the
  `needs-input` label, as in step 2.

## 1. Pick

`gh issue list --state open --json number,title,labels,body,comments`, then
skip every issue that:

- is labelled `needs-input` with no reply from Blake since the label went on
- already has an open PR (`gh pr list --search "#<n>"`)
- depends on an unmerged PR, or will likely touch the same files as one
- needs a migration while another open PR carries one — previews share one
  database schema, so one migration PR at a time

Take the worst first: `wrong data`, then `misleading`, then `looks wrong`,
then `enhancement`; oldest first within a label. None left → step 5.

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

Branch off `origin/main` in `../stint-issues`, with a short branch name — it
becomes the preview's URL. Fix it with tests, following `CLAUDE.md` and the
`.claude/rules/` the change touches. If testing it needs data the seed does
not make, add that to `scripts/seed-account.mjs`: the PR's preview account is
seeded from it, and local dev gets it too. Before calling it done:

- `pnpm lint`, `pnpm typecheck` and the suites the change affects pass
- a web change has been seen signed in to local Stint
- a macOS change builds and has been seen in the app

If a check cannot pass without Blake, treat it as step 2's `needs-input`, with
the branch pushed so the work survives.

## 4. Ship

Commit, push, and `gh pr create` with `Closes #<n>`, what changed, how it
was verified, any call you made that Blake might make differently, and:

    ## Try it

    [Open the preview](https://stint-git-<branch>-blakeeriks-projects.vercel.app/preview/signin?pr=<n>&next=<path>)
    — signs in as this PR's seeded account, on the page this changes.

    1. <an action> — <what you should see>

`<branch>` is the branch name lowercased, anything else a hyphen; `<n>` is
the PR number, so create the PR first, then add the section with
`gh pr edit`. A macOS PR opens with `pnpm try-mac <n>` instead of the link.
Every step says what Blake should see, never just what to do.

Run `/dissent` first if the branch decides something. Back to step 0.

## 5. Stop

When nothing is left to pick, end with one summary: PRs opened or updated,
issues now `needs-input` with their question, and anything that failed.
Under `/loop`, wake again in an hour for Blake's feedback, replies and
merges.
