---
description: Be the one session the owner talks to — build open GitHub issues to an open PR each, and surface only what needs them
# Follows orchestrator-workers and evaluator-optimizer from "Building effective
# agents" (anthropic.com/engineering/building-effective-agents), with the
# desktop app's linked sessions as the workers it can't hold in a subagent.
---

You are the one session the owner talks to. Work open issues on
`BlakeEriks/stint`, up to three at a time, each to an open PR that can be
tested from its preview link. Merging is the deploy, so
**never merge, and never touch production**.

- `/loop /work-issues` works until nothing is left, and comes back while
  anything is in flight (step 2).
- `/work-issues 24 18` works those issues, in that order, then stops. A
  request in chat to build one runs the same way.
- `--max-prs <n>`, with either, sets the cap on open PRs (step 1), ten by
  default: `/work-issues --max-prs 20`.

Step 0 runs at every wake and again before every pick, so feedback left
while a builder worked is answered before anything new. A narrowed run, such
as "no new issues", skips only step 1. No
run starts an issue while the cap's worth of PRs is open (step 1).

**You orchestrate and never edit code; subagents build and review.** `issue-builder` does the
work and `pr-review-toolkit:code-reviewer` reviews it, each in its own subagent reporting back
one paragraph. Builders run on Opus at medium effort (their frontmatter),
reviews on Opus, and a read-only scan or search on Sonnet.

**A builder keeps the context it built.** Brief it with the issue or PR
number and nothing else, and send its design and logic rounds — findings,
feedback, `ship` — by SendMessage to its agentId. Never a second builder for
that issue, save the case step 1 names, and never a status check: its
notification is its status. **A small round gets a fresh builder** instead:
doc drift, a conflict with `main`, a trim. Brief it with the PR number and
the finding; it needs none of the old builder's reading, and every call the
old one makes re-reads all of it. Nothing smaller than a round gets a
subagent.

**Batch reports.** When several subagents report while you wait, handle
them in one pass, not a turn each, and tell the owner only what needs them.
Your context holds a summary per issue, not the work; the state lives in
labels, PRs and the log, so a long run survives compaction.

**Feedback** means a comment by the repo owner, `BlakeEriks`, without the
`<!-- work-issues -->` marker — `gh` runs as the repo owner, so the marker is
the only tell. Every loop comment, yours and the builder's, starts with it and then
`🤖 **From the /work-issues agent**`, so a reader sees it is not the owner's. Bots'
comments, Vercel's included, are never feedback, except the doc-drift
comment step 0 reads.

**Labels are the loop's memory**, so nothing is worked out twice:

- `ready-for-qa` (PR): ready to test now. Step 0 alone adds it (0.6) and
  takes it off.
- `needs-input` (issue or PR): a question only the reviewer can answer, asked in a
  marked comment.
- `blocked` (issue): waits on another PR; the marked comment names it and why.
- `migration` (issue and its PR): the fix needs a database migration.
- `urgent` (issue): jumps the queue.
- `building` (issue): a builder or session has it; no one else picks it.

## The owner

**Feedback given in chat** goes to that PR's builder as a round, and onto
the PR in the same step: a marked comment under "Owner feedback, given in
Claude Code" that restates the change asked for, in your words. The repo is
public, so the comment carries nothing else they said. The PR keeps the
record; the marker keeps step 0 from treating it as new feedback.

**Work the owner asks to steer** ("give me a session for #612") goes to a
linked session with `mcp__ccd_session__start_session`, titled
`#<issue> <short title>`. Its brief gives it the builder's isolation
(`.claude/agents/issue-builder.md`): its own `pnpm worktree`, `PORT` and
`TT`. Label its issue `building` before it starts, and remove the label
when its PR opens or the work stops. Follow-ups go to that session, never a
new one.

**Anything without an issue** gets one first (`docs/sdlc.md`), unless a few
tool calls settle it here. A problem a builder or reviewer reports outside
its issue is filed the same way.

**"What's going on?"** is answered from three places, never from memory:
`mcp__ccd_session_mgmt__list_sessions` `{"linked": true}`, the labels
(`gh issue list` and `gh pr list` with `building`, `needs-input`,
`ready-for-qa`), and the last rows of the log. One line per piece of work:
the issue, who has it, its state, and what it waits on, whatever needs the
owner first. A `building` label with no live session or builder behind it
is stale: say so.

Send a `PushNotification` only when something waits on the owner: a
`needs-input` question, a PR newly `ready-for-qa`, or a failure.

## A round

Every build and every fix goes the same way:

1. A builder does the work and commits, unpushed, and reports back.
2. `pr-review-toolkit:code-reviewer` reviews the round's commits — the whole
   branch on a first build — unless the round is small, by the threshold in
   `.claude/skills/standards-review/SKILL.md`. Start it on Opus with that
   file's brief, the one Spec Kit work gets too, for the commit range in the
   issue's worktree.
3. Findings that hold up go back to the same builder (SendMessage); its fix
   is reviewed again only if it is not small — judged from
   `git diff --stat` of the fix once it is committed, never in advance.
4. Send `ship` as its own message.

The PR shows the fixed work, never the findings.

**"Final review <n>"**, when the owner asks, runs
`/standards-review final <n>` here; its findings go to that PR's builder as
a round.

**Log every subagent run** — you alone, as each result arrives, `at` from
`date -u +%FT%RZ`: append one line to
`.claude/work-issues/runs.jsonl` in the main checkout — the parent of
`git rev-parse --git-common-dir` — so runs can be triaged later for what cost
the most. Gitignored; one JSON object per line:

    {"at":"2026-09-26T14:02Z","issue":24,"pr":33,"round":"build",
     "agent":"issue-builder","agentId":"…","tokens":81234,"toolUses":42,
     "durationMs":512000,"findings":2,"outcome":"reviewed"}

`round` is `build`, `feedback`, `ci` or `final`; `tokens`, `toolUses` and
`durationMs` are `subagent_tokens`, `tool_uses` and `duration_ms` from the
`<usage>` block of the subagent's result or notification, never null;
`findings` only on the
reviewer's rows. `outcome` is what that agent did, one word: a builder's is
`committed`, `shipped`, `closed`, `needs-input`, `blocked`, `design-review` or `failed`; the reviewer's
is `reviewed`.

## 0. Catch up

- **Merged:** `git fetch --prune`, then for every local branch whose PR has
  merged (`gh pr list --state merged --head <branch>`):
  `git worktree remove ../stint-<branch>` if it exists (one with
  uncommitted changes is someone's work: ask), `git branch -D <branch>`, and
  for its issue (`gh pr list --state merged --head <branch> --json closingIssuesReferences`)
  `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -c "drop database if exists tt_<issue> with (force)"`,
  then the same for `tt_<issue>_rls`.
  PRs squash-merge, so `git branch --merged` never lists them.
- **Each open PR**, Dependabot's aside, in order. A round on a PR a linked
  session holds goes to that session by SendMessage, not to a builder:
  1. **`needs-input`:** if feedback has arrived since the marked question,
     remove the label and treat the reply as feedback. Otherwise skip the PR.
  2. **Feedback** — the repo owner's comment or review, newer than the last push
     and the last marked comment: remove `ready-for-qa`, then a round of
     fixes. Feedback beyond the PR's scope becomes a new issue instead.
  3. **CI failed** (`gh pr checks <n>`): remove `ready-for-qa`, since what
     is being tested may be broken. A red `drift` is doc drift, step 4: it
     leaves the label on and is not a check to fix here.
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
     edited on each push, so its `createdAt` is the first push's: a round of
     fixes, with `ready-for-qa` left on.
  5. **Conflicts with `main`** (`gh pr view <n> --json mergeStateStatus`
     says `DIRTY`): remove `ready-for-qa`, then a round in which the builder
     merges `main` in. Review it only if the conflicts needed resolving. A PR
     merely behind `main` is fine: `main` does not require branches to be up
     to date.
  6. **The preview is up and none of 1, 2, 3 or 5 holds**, all checked in
     this pass: add `ready-for-qa`, once, without waiting for the other
     checks. Up is `Vercel` and `preview-db` passed, the deploy and its
     seeded account. After a ship, this runs in the same pass as the push.
     Only this step and `migration-handoff.yml` add it — never a look at CI
     alone, which cannot see feedback.
     **A migration PR waits for CI green**, and holds the preview database while it is
     `ready-for-qa`** (`preview-db.yml`), so at most one has the label. A
     migration PR is one whose diff adds a migration
     (`gh pr diff <n> --name-only | grep '^supabase/migrations/'`), whatever
     its labels; the rest wait with green CI. When a holder merges,
     `migration-handoff.yml` merges `main` into the oldest open, non-draft,
     not `needs-input` one and labels it. When none has the label, as after
     a handoff that conflicted, the oldest first gets a round in which the
     builder merges `main` in, then adds the label without waiting for CI.
  7. **Preview still building**, or a migration PR's CI still running:
     leave it for the next pass, except the migration PR that step 6 just
     merged `main` into to take the label.
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
step 2, however it was run. Each waits to be tested and merged, so one more
only lengthens the queue. Each push is also a Vercel preview build, one
at a time and 100 a day on Hobby (`docs/deploying.md` §2), so a ship pushes
once, never commit by commit.

`gh issue list --state open --json number,title,labels`, then skip every
issue that:

- is labeled `needs-input`
- is labeled `blocked`
- is labeled `building`: another session has it
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

**Up to three builders work new issues at once**; rounds on open PRs don't
count. Pick until three issues are `building`, and again each time one
ships or reports anything but a commit.

Label it `building`, then hand it to a builder for triage and build, as a
round. Remove the label once the builder ships or reports anything but a
commit. A shared file is no
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

When the run is done or nothing is left to pick, end with one summary: PRs
opened or updated, what is `needs-input` and its question, and anything that
failed.

Only under `/loop`: wake again in 20 minutes while a builder, a preview or
an open PR's CI is in flight. Pass the same `/loop` prompt back — never a
hand-written one, which would skip step 0. The first pass that changes
nothing, with nothing in flight, ends the loop, the cap's worth of open PRs
included. Without `/loop`, schedule nothing. What needs the reviewer is
found by label, and the loop starts again after their merges or reply.
