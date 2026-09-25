---
description: Work through open GitHub issues one at a time, to an open PR each, stopping only for what needs Blake
---

Work open issues on `BlakeEriks/stint` one at a time, each to an open PR
Blake can test from its preview link. Blake merges; merging is the deploy, so
**never merge, and never touch production**.

- `/work-issues 24 18` works those issues, in that order, then stops.
- `/work-issues --one` works the next issue step 1 picks, then stops.
- `/work-issues` alone works until nothing is left; `/loop /work-issues`
  keeps coming back.

Step 0 runs every time, so open PRs are caught up before anything new.

**You orchestrate; subagents build.** Each issue, and each round of fixes on
an open PR, runs in its own subagent (Opus), handed this file, the issue or
PR number and the step it is on. It reports back one paragraph: the PR, the
`needs-input` question, or what failed. Your context holds a summary per
issue, not the work, and a long run survives auto-compaction.

All work happens in one long-lived worktree, `../stint-issues`, switching
branches there. Make it with `pnpm worktree issues` the first time. Every
switch after that is `git fetch --prune`, then the switch, then
`pnpm install` and `pnpm tokens`, then a restart of its dev server — which
otherwise keeps serving the last branch's build.

**Every comment you post starts with `<!-- work-issues -->`.** `gh` runs as
Blake, so the marker is the only way to tell your comments from his. **Blake's
comment** below means one by `BlakeEriks` without the marker; bots' comments,
Vercel's included, are never feedback.

**`ready-for-qa` on a PR means Blake can test it now**: CI green, nothing he
said left unanswered. Adding it posts to Discord #events. Take it off the
moment either stops being true.

## 0. Catch up

- **Merged:** `git fetch --prune`, `git switch --detach origin/main`, then
  `git branch -d` every branch `git branch --merged origin/main` lists.
- **Each open PR of yours**, in order:
  1. **Feedback:** a comment or review of Blake's newer than your last push
     and your last marked comment. Remove `ready-for-qa`, then a subagent
     addresses it: change, verify, push, reply with what changed and an
     updated **Try it**. Feedback beyond the PR's scope becomes a new issue,
     linked in the reply. A question back gets `needs-input`, as in step 2.
  2. **CI failed** (`gh pr checks <n>`): remove `ready-for-qa`; a subagent
     reads the failing job's log, fixes it on the branch and pushes. A failure
     the branch did not cause — red on `main` too — is still fixed, in its own
     commit that says so.
  3. **CI green and nothing outstanding:** add `ready-for-qa`, once.
  4. **CI still running:** leave it for the next pass.

## 1. Pick

`gh issue list --state open --json number,title,labels,body,comments`, then
skip every issue that:

- is labelled `needs-input` with no comment of Blake's since your last
  marked one
- already has an open PR
  (`gh issue view <n> --json closedByPullRequestsReferences`)
- depends on an unmerged PR, or will likely touch the same files as one
- needs a migration while another open PR carries one — previews share one
  database schema, so one migration PR at a time

Take the worst first: `wrong data`, then `misleading`, then `looks wrong`,
then `enhancement`; oldest first within a label. None left → step 5.
Otherwise hand it to a subagent for steps 2–4.

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
your recommendation, add the `needs-input` label, and report back.

## 3. Build

Picking up a `needs-input` issue Blake has answered: remove the label, and
continue its pushed branch if it has one. Anything else: branch off
`origin/main` in `../stint-issues`. Keep the branch name under 30
characters: it becomes the preview's URL, and Vercel hashes longer ones.

Fix it with tests, following `CLAUDE.md` and the `.claude/rules/` the change
touches. If testing it needs data the seed does not make, add that to
`scripts/seed-account.mjs`: the PR's preview account is seeded from it, and
local dev gets it too. Before calling it done:

- `pnpm lint`, `pnpm typecheck` and the suites the change affects pass
- a web change has been seen signed in to local Stint
- a macOS change builds and has been seen in the app

Commit, and report back unpushed. The orchestrator has a second subagent
review the diff with `/code-review`, and `/security-review` too when it
touches auth, the API or data access, then sends the builder what holds up
to fix. Blake sees the fixed work, never the findings.

If a check cannot pass without Blake, treat it as step 2's `needs-input`, with
the branch pushed so the work survives.

## 4. Ship

Push, and `gh pr create` with `Closes #<n>`, what changed, how it was
verified, any call you made that Blake might make differently, and:

    ## Try it

    [Open the preview](https://stint-git-<branch>-blakeeriks-projects.vercel.app/preview/signin?pr=<n>&next=<path>)
    — signs in as this PR's seeded account, on the page this changes.

    1. <an action> — <what you should see>

A macOS PR opens its section with the command instead:

    ## Try it

    ```bash
    pnpm try-mac <n>
    ```
    Opens Stint Preview in the menu bar, signed in as this PR's seeded account.

    1. <an action> — <what you should see>

`<branch>` is the branch name lowercased, anything else a hyphen; `<n>` is
the PR number, so create the PR first, then add the section with
`gh pr edit`. Every step says what Blake should see, never just what to do.
No `ready-for-qa` yet — step 0 adds it once CI is green.

Then step 5 if this was the `--one` issue or the last one named; otherwise
back to step 0.

## 5. Stop

End with one summary: PRs opened or updated, which are `ready-for-qa`,
issues now `needs-input` with their question, and anything that failed.
Under `/loop`, wake again in an hour for CI results, Blake's feedback,
replies and merges.
