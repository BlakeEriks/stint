---
description: Work through open GitHub issues one at a time, to an open PR each, stopping only for a decision the issue can't settle
# Follows orchestrator-workers and evaluator-optimizer from "Building effective
# agents" (anthropic.com/engineering/building-effective-agents).
---

Work open issues on `BlakeEriks/stint` one at a time, each to an open PR
that can be tested from its preview link. Merging is the deploy, so
**never merge, and never touch production**.

- `/work-issues 24 18` works those issues, in that order, then stops.
- `/work-issues --one` works issues until one PR is open, then stops.
  `/loop /work-issues --one` starts no second issue: later wakes only catch
  up, until that PR is `ready-for-qa` or `needs-input`.
- `/work-issues` alone works until nothing is left; `/loop /work-issues`
  comes back while CI is still running.
- `--max-prs <n>`, with any of these, sets the cap on open PRs (step 1),
  ten by default: `/work-issues --max-prs 20`.

Step 0 runs at every wake and again before every pick, so feedback left
while a builder worked is answered before anything new. No
mode starts an issue while the cap's worth of PRs is open (step 1).

**You orchestrate; subagents build and review.** `issue-builder` does the
work and `pr-review-toolkit:code-reviewer` reviews it, each in its own subagent reporting back
one paragraph. **One builder per issue**: brief it with the issue or PR
number and nothing else, and send it everything after — findings, `ship` —
by SendMessage to its agentId. Never a second builder for that issue — save
the one case step 1 names, when its instructions have changed — and never a
status check: its notification is its status. Your context holds a summary per issue, not the work, and a
long run survives auto-compaction. Nothing smaller than an issue or a round
of fixes gets a subagent — each one re-reads the project, and that is the
cost.

**Feedback** means a comment by the repo owner, `BlakeEriks`, without the
`<!-- work-issues -->` marker — `gh` runs as the repo owner, so the marker is
the only tell. Every loop comment, yours and the builder's, starts with it and then
`🤖 **From the /work-issues agent**`, so a reader sees it is not the owner's. Bots'
comments, Vercel's included, are never feedback, except the doc-drift
comment step 0 reads.

**Labels are the loop's memory**, so nothing is worked out twice:

- `ready-for-qa` (PR): ready to test and merge now — no conflict with
  `main`, CI green (or, for the next migration PR to hold the preview
  database, just `main` merged in: step 6), no question open, no feedback
  unanswered. Off the
  moment any of that stops being true.
- `needs-input` (issue or PR): a question only the reviewer can answer, asked in a
  marked comment.
- `blocked` (issue): waits on another PR; the marked comment names it and why.
- `migration` (issue and its PR): the fix needs a database migration.
- `urgent` (issue): jumps the queue.

## A round

Every build and every fix goes the same way:

1. A builder does the work and commits, unpushed, and reports back.
2. `pr-review-toolkit:code-reviewer` reviews the round's commits — the whole
   branch on a first build — unless the round is small: under about 20 lines
   and no logic change in auth, the API or data access. Start it on Opus with
   the brief in `.claude/skills/standards-review/SKILL.md`, the one Spec Kit
   work gets too, for the commit range in `../stint-issues`.
3. Findings that hold up go back to the same builder (SendMessage); its fix
   is reviewed again only if it is not small — judged from
   `git diff --stat` of the fix once it is committed, never in advance.
4. Send `ship` as its own message.

The PR shows the fixed work, never the findings.

**Log every subagent run** — you alone, as each result arrives, `at` from
`date -u +%FT%RZ`: append one line to
`.claude/work-issues/runs.jsonl` in the main checkout — the parent of
`git rev-parse --git-common-dir` — so runs can be triaged later for what cost
the most. Gitignored; one JSON object per line:

    {"at":"2026-09-26T14:02Z","issue":24,"pr":33,"round":"build",
     "agent":"issue-builder","agentId":"…","tokens":81234,"toolUses":42,
     "durationMs":512000,"findings":2,"outcome":"reviewed"}

`round` is `build`, `feedback` or `ci`; `tokens`, `toolUses` and
`durationMs` are what the subagent's result reports; `findings` only on the
reviewer's rows. `outcome` is what that agent did, one word: a builder's is
`committed`, `shipped`, `closed`, `needs-input`, `blocked`, `design-review` or `failed`; the reviewer's
is `reviewed`.

## 0. Catch up

- **Merged:** in `../stint-issues`, `git fetch --prune`,
  `git switch --detach origin/main`, then `git branch -D` every local branch
  whose PR has merged (`gh pr list --state merged --head <branch>`). PRs
  squash-merge, so `git branch --merged` never lists them.
- **Each open PR of yours**, in order:
  1. **`needs-input`:** if feedback has arrived since the marked question,
     remove the label and treat the reply as feedback. Otherwise skip the PR.
  2. **Feedback** — the repo owner's comment or review, newer than the last push
     and the last marked comment: remove `ready-for-qa`, then a round of
     fixes. Feedback beyond the PR's scope becomes a new issue instead.
  3. **CI failed** (`gh pr checks <n>`): remove `ready-for-qa`. A red
     `drift` is doc drift, step 4, not a check to fix here.
     - The same check red on `main`, or on another PR the same way, is not
       this PR's fault: open one `urgent` bug issue for it if none exists —
       or `needs-input`, if only the reviewer can fix it, like a paused `stint-test`
       — and leave the PRs alone.
     - Otherwise a round of fixes. After two rounds on the same check that
       did not turn it green, label the PR `needs-input`, with a marked
       comment saying what failed and what was tried.
  4. **Doc drift** — the newest comment starting `<!-- doc-drift:<sha> -->`
     names the PR's head commit (`gh pr view <n> --json headRefOid`), lists
     findings, and no marked comment is newer than its `updatedAt` — it is
     edited on each push, so its `createdAt` is the first push's: remove
     `ready-for-qa`, then a round of fixes.
  5. **Conflicts with `main`** (`gh pr view <n> --json mergeStateStatus`
     says `DIRTY`): remove `ready-for-qa`, then a round in which the builder
     merges `main` in. Review it only if the conflicts needed resolving. A PR
     merely behind `main` is fine: `main` does not require branches to be up
     to date.
  6. **CI green and none of the above**, all checked in this pass: add
     `ready-for-qa`, once. Only this step and `migration-handoff.yml` add
     it — never a look at CI alone, which cannot see feedback.
     **A migration PR holds the preview database while it is
     `ready-for-qa`** (`preview-db.yml`), so at most one has the label. A
     migration PR is one whose diff adds a migration
     (`gh pr diff <n> --name-only | grep '^supabase/migrations/'`), whatever
     its labels; the rest wait with green CI. When a holder merges,
     `migration-handoff.yml` merges `main` into the oldest open, non-draft,
     not `needs-input` one and labels it. When none has the label, as after
     a handoff that conflicted, the oldest first gets a round in which the
     builder merges `main` in, then the label once `main` is merged in,
     without waiting for CI.
  7. **CI still running:** leave it for the next pass.
- **Each open Dependabot PR** (`gh pr list --author app/dependabot`), the
  same steps, except:
  - 3: first `gh pr merge --disable-auto <n>`, so the fix is reviewed
    before it merges.
  - 5: `DIRTY` with only Dependabot's commits is left to Dependabot, which
    rebases its own.
  - 6: only when auto-merge is off (`gh pr view <n> --json autoMergeRequest`
    is null). The rest merge themselves (`dependabot-merge.yml`).
- **Blocked issues:** remove `blocked` from any whose named PR has merged or
  closed — one `gh pr view` each, not a new investigation.
- **Answered issues:** remove `needs-input` from any issue with feedback
  since its marked question, so the label says whose move it
  is while a builder is busy elsewhere. A reply to a design review goes to
  that issue's builder now, as a round, before anything new is picked.

## 1. Pick

**Stop picking new issues at ten open PRs**, or `--max-prs` if given. Count the
open PRs not by Dependabot (`gh pr list --json author`); the cap or more →
step 2, whatever the mode. Each waits to be tested and merged, so one more
only lengthens the queue. Each push is also a Vercel preview build, one
at a time and 100 a day on Hobby (`docs/deploying.md` §2), so a ship pushes
once, never commit by commit.

`gh issue list --state open --json number,title,labels`, then skip every
issue that:

- is labeled `needs-input`
- is labeled `blocked`
- is labeled `feature` and is not code yet: it still "owes the gate its
  answers", is a purchase or a setting (buying the domain, upgrading a
  plan), or waits on an account only the repo owner can make
- already has an open PR
  (`gh issue view <n> --json closedByPullRequestsReferences`)

`urgent` first, then the worst: `wrong data`, `misleading`, `looks wrong`,
then `enhancement`, then `feature` (milestone `Alpha`, then `Launch`, then
none); oldest first within a label. None left → step 2.

**A feature that needs an open PR's unmerged work** is stacked on it: the
builder branches off that PR's branch and opens its PR against it, saying
which merges first.

Hand it to a builder for triage and build, as a round. A shared file is no
reason to wait: step 0's conflict check merges `main` into whichever PR conflicts. An issue a
builder already triaged — its `agentId` is in the log — goes back to that
builder by SendMessage, which still holds the reading — unless
`.claude/agents/issue-builder.md` has changed since that builder's first log row
(`git log -1 --format=%cI origin/main -- .claude/agents/issue-builder.md`),
since a builder keeps the instructions it started with, or it no longer
answers: then a new one. It reports one of: a commit ready for review,
`closed` (the issue no longer held), `needs-input`, `blocked`, or
`design-review: <path>`. Once it has shipped, or reported any but the
first, step 0 again, then pick again.

**A design review** is a feature's builder asking the reviewer to see a screen
before it is built. Read the draft at `<path>` whole, publish it with the
Artifact tool — a private page the reviewer opens from a phone — and post a
marked comment on the issue: the link, one line per variation saying what
it is best at, and "Reply here with a pick or changes." Label the issue
`needs-input`. The reply goes back to that builder like any answer; a
redraft is republished to the same link, named in the comment.

## 2. Stop

When the mode is done or nothing is left to pick, end with one summary: PRs
opened or updated, which are `ready-for-qa`, what is `needs-input` and its
question, and anything that failed.

Only under `/loop`: wake again in 15 minutes while an open PR's CI is still
running, and in 60 while the cap's worth of PRs is open and issues are left to pick,
so a merge frees a slot without a restart. Pass the same `/loop` prompt
back — never a hand-written one, which would skip step 0. Without `/loop`,
schedule nothing. Otherwise end the loop: what needs the reviewer is found by
label, and the loop starts again after the reply.
