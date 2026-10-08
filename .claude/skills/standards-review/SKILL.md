---
name: standards-review
description: Review a branch's commits against Stint's standards (comments, Constitution V, design) with the official code-reviewer agent, before its PR opens. Run by /work-issues each round and by Spec Kit after /speckit-implement.
argument-hint: "[commit range, default origin/main..HEAD]"
# Wraps the official pr-review-toolkit:code-reviewer agent with this repo's
# brief, so both ways code is written get one review. Custom because
# nothing fits whole: /code-review hunts bugs only, and
# pr-review-toolkit:review-pr runs six agents that don't know the brief.
---

Review `$ARGUMENTS` (default `origin/main..HEAD`) in the current checkout.

Start `pr-review-toolkit:code-reviewer` on Opus (`model: "opus"`) with this
brief, filling in the range and the checkout:

> Review the commits `<range>` in `<checkout>`. You are read-only: change
> nothing. Review the diff and what it calls, for security too when it
> touches auth, the API or data access. Hold it to `CLAUDE.md`, the
> constitution (`.specify/memory/constitution.md`) and the
> `.claude/rules/` its files load: `comments.md` for every added or changed
> comment, `changes.md` for special cases, copied mechanisms and new debt,
> and Constitution V for its tests. Report in one paragraph each finding
> you are confident in, with file:line, the failure and the fix; a
> comment's fix is usually cutting it.

Then check each finding against the code. Fix the findings that hold, in a
commit of their own, and say which you left and why. If the fix is not small
(about 20 lines, or any logic in auth, the API or data access), review it
once more.

Under `/work-issues`, the orchestrator starts the reviewer with this brief
and sends the findings to the builder instead.
