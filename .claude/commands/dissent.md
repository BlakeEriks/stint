---
disable-model-invocation: true
description: Argue against the current branch's decisions — not its syntax — with one agent that did not write it
---

Review this branch against `main`, or `$ARGUMENTS` if a ref or path is given.

**This is not a code review.** `/code-review` asks whether the code does what
it says; this asks whether what it says is right. It is for the decision, the
claim and the plan — the things a correctness pass takes as given because they
are the spec rather than the diff.

**Run it while the branch can still change.** Halfway through is the point:
early enough that a finding costs an edit rather than a rewrite, late enough
that there is something real to argue with. Run it again before merging
anything that changed a decision.

## 0. Decide whether there is a decision to argue with

`git diff main...HEAD --stat`, then the diff itself — not the commit
messages, which argue for the change rather than describing it.

**If nothing here decides anything** — a defect fix, a mechanical rename, work
whose only open question is whether it functions — say so in one line and
stop. Nothing below runs. This is the cheap exit: reading the diff to make
this call costs one pass you already had to make; spinning up a reviewer for
a decision that was never made does not.

A decision is: a price, a thesis, a positioning claim, a competitor read, a
milestone order, a scope cut, a deferral, a doc rewrite, any claim about a
market or a user, or a plan whose cost lands on someone later than now.

## 1. Name the claims

Write down the three to five **claims** the branch is making — not the files
it touched, the things it asserts are true, will work, or are worth doing.
This is what the reviewer argues against, not the diff itself.

## 2. One agent, read-only, told to disagree

One subagent, not a fan-out. Give it the branch, the claim list, and this
brief:

> Argue this branch is wrong. Find:
> - a claim contradicted by evidence **already in the branch** — the table two
>   rows below the assertion, the code the doc describes
> - the risk the branch does not name
> - what will be false in six months
> - where the argument is a preference wearing the clothes of a reason
>
> Cite `file:line`. Do not validate — a report that the branch is sound has
> either found nothing or been too polite to say; say which.

Dead pointers, doc-vs-doc contradictions and claim-ownership duplication are
`/code-review` and `/copyedit`'s jobs, not this one. One agent arguing the
decision is the part nothing else does; splitting it three ways bought
coverage this repo's size doesn't need at three times the cost.

## 3. Verify the load-bearing findings yourself

**Do not report a finding you have not checked.** A claim that the paywall
gates a query parameter is worth ten minutes with the route. Check the ones
that would change what gets built; say which you verified and which you are
passing on as reported.

## 4. Report, then separate the two kinds

- **Mechanical** — a dead reference, a stale claim. Fix it. It has a right
  answer.
- **Judgment** — the thesis is wrong, the price is wrong, the order is wrong,
  the risk is unnamed. **This is a conversation, not an edit.** Put it to the
  user with what you think and why, and wait.

Never fold a judgment finding into a fix commit. A reviewer disagreeing with
a decision the user made is something the user decides, and burying it in a
diff is how it gets decided by nobody.

## What this is for

The expensive errors are in the decision, not the syntax, and they are
invisible from inside the argument that produced them. A claim and the
evidence that refutes it can sit four lines apart in one file, reread several
times, and never collide — which is the specific failure this exists to catch.
