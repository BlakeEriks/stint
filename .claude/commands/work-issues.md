---
description: Work through open GitHub issues one at a time, to an open PR each, stopping only for what needs Blake
---

Work open issues on `BlakeEriks/stint` one at a time, each to an open PR
Blake can test from its preview link. Blake merges; merging is the deploy, so
**never merge, and never touch production**.

- `/work-issues 24 18` works those issues, in that order, then stops.
- `/work-issues --one` works issues until one PR is open, then stops.
- `/work-issues` alone works until nothing is left; `/loop /work-issues`
  comes back while CI is still running.

Step 0 runs every time, so open PRs are caught up before anything new.

**You orchestrate; subagents build and review.** `issue-builder` does the
work and `issue-reviewer` reviews it, each in its own subagent reporting back
one paragraph. Your context holds a summary per issue, not the work, and a
long run survives auto-compaction. Nothing smaller than an issue or a round
of fixes gets a subagent — each one re-reads the project, and that is the
cost.

**Blake's comment** means one by `BlakeEriks` without the
`<!-- work-issues -->` marker every loop comment starts with — `gh` runs as
Blake, so the marker is the only tell. Bots' comments, Vercel's included, are
never feedback, except the doc-drift comment step 0 reads.

**Labels are the loop's memory**, so nothing is worked out twice:

- `ready-for-qa` (PR): Blake can test it now — CI green, no question open,
  nothing he said unanswered. Off the moment any of that stops being true.
- `needs-input` (issue or PR): a question only Blake can answer, asked in a
  marked comment.
- `blocked` (issue): waits on another PR; the marked comment names it and why.
- `migration` (issue and its PR): the fix needs a database migration.
- `urgent` (issue): Blake's, to jump the queue.

Adding `ready-for-qa` or `needs-input` posts to Discord.

## A round

Every build and every fix goes the same way:

1. A builder does the work and commits, unpushed, and reports back.
2. `issue-reviewer` reviews the round's commits — the whole branch on a
   first build — unless the round is small: under about 20 lines and no
   logic change in auth, the API or data access. It runs `/code-review`, and
   `/security-review` too when the commits touch auth, the API or data
   access.
3. Findings that hold up go back to the same builder (SendMessage); its fix
   is reviewed again only if it is not small.
4. Tell the builder `ship`.

Blake sees the fixed work, never the findings.

**Log every subagent run**: append one line to
`.claude/work-issues/runs.jsonl` in the main checkout — the parent of
`git rev-parse --git-common-dir` — so runs can be triaged later for what cost
the most. Gitignored; one JSON object per line:

    {"at":"2026-09-26T14:02Z","issue":24,"pr":33,"round":"build",
     "agent":"issue-builder","agentId":"…","tokens":81234,"toolUses":42,
     "durationMs":512000,"findings":2,"outcome":"reviewed"}

`round` is `build`, `feedback` or `ci`; `tokens`, `toolUses` and
`durationMs` are what the subagent's result reports; `findings` is for
`issue-reviewer`; `outcome` is one word — `reviewed`, `shipped`,
`needs-input`, `blocked`, `failed`.

## 0. Catch up

- **Merged:** in `../stint-issues`, `git fetch --prune`,
  `git switch --detach origin/main`, then `git branch -d` every branch
  `git branch --merged origin/main` lists except `main`.
- **Each open PR of yours**, in order:
  1. **`needs-input`:** if Blake has commented since the marked question,
     remove the label and treat his reply as feedback. Otherwise skip the PR.
  2. **Feedback** — a comment or review of Blake's newer than the last push
     and the last marked comment: remove `ready-for-qa`, then a round of
     fixes. Feedback beyond the PR's scope becomes a new issue instead.
  3. **CI failed** (`gh pr checks <n>`): remove `ready-for-qa`.
     - The same check red on `main`, or on another PR the same way, is not
       this PR's fault: open one `urgent` bug issue for it if none exists —
       or `needs-input`, if only Blake can fix it, like a paused `stint-test`
       — and leave the PRs alone.
     - Otherwise a round of fixes. After two rounds on the same check that
       did not turn it green, label the PR `needs-input`, with a marked
       comment saying what failed and what was tried.
  4. **Doc drift** — the newest comment starting `<!-- doc-drift:<sha> -->`
     names the PR's head commit (`gh pr view <n> --json headRefOid`), lists
     findings, and has no marked comment after it: remove `ready-for-qa`,
     then a round of fixes.
  5. **CI green and none of the above:** add `ready-for-qa`, once.
  6. **CI still running:** leave it for the next pass.
- **Blocked issues:** remove `blocked` from any whose named PR has merged or
  closed — one `gh pr view` each, not a new investigation.

## 1. Pick

`gh issue list --state open --json number,title,labels`, then skip every
issue that:

- is labeled `needs-input` with no comment of Blake's since the last marked
  one
- is labeled `blocked`
- already has an open PR
  (`gh issue view <n> --json closedByPullRequestsReferences`)
- is labeled `migration` while an open PR is too — previews share one
  database schema

`urgent` first, then the worst: `wrong data`, `misleading`, `looks wrong`,
then `enhancement`; oldest first within a label. None left → step 2.

Otherwise hand it to a builder for triage and build, as a round. It reports
one of: a commit ready for review, `needs-input`, or `blocked` — for either
of those two, pick again.

## 2. Stop

When the mode is done or nothing is left to pick, end with one summary: PRs
opened or updated, which are `ready-for-qa`, what is `needs-input` and its
question, and anything that failed.

Under `/loop`, wake again in an hour only while an open PR's CI is still
running. Otherwise end the loop: Discord tells Blake when something needs
him, and he starts it again after replying.
