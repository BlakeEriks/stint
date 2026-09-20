---
description: Argue against the current branch — its decisions, not its syntax — with agents that did not write it
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

## When it is worth running

Whenever the branch decides something rather than implementing something:

- a price, a thesis, a positioning claim, a competitor read
- a milestone order, a scope cut, a deferral
- a doc rewrite, or any claim about a market or a user
- a plan whose cost lands on someone later

A defect fix does not need this. Neither does work whose only question is
whether it functions.

## 1. See what the branch actually claims

`git diff main...HEAD --stat`, then read the diff itself — not the commit
messages, which argue for the change rather than describing it.

Write down, for yourself, the three to five **claims** the branch is making.
Not the files it touched: the things it asserts are true, or will work, or are
worth doing. Those are what the reviewers are pointed at.

## 2. Fan out three agents, in one message, read-only

Each gets the branch, the claim list, and one angle. Tell each to cite
`file:line` and to say plainly where it disagrees. They run in parallel — they
are reading, not editing, so they cannot read each other's half-applied work
the way `/feature`'s reviewers could.

**The dissent.** The brief is to argue the branch is wrong, and it is worded
that way. *The author has been agreeing with themselves for a while and needs
a dissenting read.* Ask specifically for:

- a claim contradicted by evidence **already in the branch** — the table two
  rows below the assertion, the code the doc describes
- the risk the branch does not name
- what will be false in six months
- where the argument is a preference wearing the clothes of a reason

It is told not to validate. A reviewer that reports the branch is sound has
either found nothing or been too polite to say; ask which.

**The mechanic.** Dead pointers, contradictions between two files in the
branch, claims that disagree with the code, and anything a cut deleted that
something else still points at. This is the pass that catches a doc sending a
reader to a file that no longer says what the pointer promises.

**The duplication.** One claim, one owning doc, per `CLAUDE.md`'s routing
table. Also: what got longer without earning it, and negations that
`docs/CLAUDE.md` would reject.

For a branch that is mostly code, swap the third for **correctness** — but
then use `/code-review`, which is better at it, and keep dissent and mechanic
here.

## 3. Verify the load-bearing findings yourself

**Do not report a finding you have not checked.** A reviewer claiming the
paywall gates a query parameter is worth ten minutes with the route; a
reviewer claiming a pointer is dead is one `grep`. The ones worth checking are
the ones that would change what gets built.

Say which findings you verified and which you are passing on as reported.

## 4. Report, then separate the two kinds

Findings divide cleanly, and mixing them is how the second kind gets quietly
patched:

- **Mechanical** — dead references, contradictions, duplication, stale
  claims. Fix these. They have a right answer.
- **Judgment** — the thesis is wrong, the price is wrong, the order is wrong,
  the risk is unnamed. **These are a conversation, not an edit.** Put them to
  the user with what you think and why, and wait.

Never fold a judgment finding into a fix commit. A reviewer disagreeing with
a decision the user made is something the user decides, and burying it in a
diff is how it gets decided by nobody.

## What this is for

The expensive errors are in the decision, not the syntax, and they are
invisible from inside the argument that produced them. A claim and the
evidence that refutes it can sit four lines apart in one file, reread several
times, and never collide — which is the specific failure this exists to catch.
