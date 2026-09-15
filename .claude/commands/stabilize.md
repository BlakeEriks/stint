---
description: Survey the repo with subagents, agree a plan, then repair it in gated phases
---

Stabilize the codebase — a heavy pass for eliminating tech debt before building
fast again. Scope it to `$ARGUMENTS` if given; otherwise everything.

You are the decision maker. Subagents running Opus do the reading, editing and
verifying; you read only what a decision needs. Spend your own tokens on
judgement, not on grunt work.

## 1. Build the harness first

Before any survey, have one agent write a script in the scratchpad that rebuilds
two throwaway databases on the local Supabase Postgres (`:54322`) and runs every
check in order, printing PASS/FAIL per step:

    lint  typecheck  check:type  detox  tokens:validate
    core:test  web:test  test:ui  test:rls

`.github/workflows/ci.yml` holds the database recipe. Take `REPO` and `DB` from
the environment so phases running in parallel worktrees do not collide, and
accept a step filter so a phase can run a subset.

**Establish the baseline before changing anything.** A phase that starts red
cannot prove it stayed green.

## 2. Survey in parallel

Fan out read-only agents in one message, one per area, each capped at ~800 words
and required to cite `file:line`. Areas that divided cleanly:

- tests — redundancy, change detectors, gaps, flakiness
- docs vs code drift, measured against `docs/CLAUDE.md`
- infra — CI, scripts, migrations, tokens, Swift, dependencies
- frontend — complexity, duplication, dead code, design-rule violations
- money and contract correctness — rates, schema drift, cache invalidation

Tell each agent what the others cover so they do not re-report it. Ask for
ranked findings with an effort tag, and for behaviour-changing findings to be
flagged separately.

Surveys find more than a hand-written list. Verify the list you were given
rather than trusting it: a claim that something is dead, duplicated or already
correct is exactly the kind that has rotted.

## 3. Present the plan, wait for sign-off

Separate **decisions with consequences** from work you will just do. A decision
earns a place on that list when it removes a capability, changes what a user
sees, alters the schema, or costs money. Recommend one option for each; do not
survey alternatives.

Then give the phase order and what verifies each. Wait.

## 4. Execute in gated phases

One branch, one commit per phase, so any phase can be dropped. Sequence by
dependency and run independent phases in parallel:

1. deletions — the tree shrinks before anything is refactored on top of it
2. the API contract — schema, validation, row types
3. data correctness — money, rates, a parity test where two copies must agree
4. the client data layer — cache keys, formatters, date helpers
5. components — the expensive mechanisms, shared states, extractions
6. structure and CI
7. comments, then docs — last, so they describe the final form

**Cut every worktree yourself from the current branch head.** An agent that
creates its own may branch from a stale base and its work will conflict.

Give each phase agent: the harness invocation, the files it owns, the files
another agent is holding, and the instruction to verify that each new test fails
when its rule is reverted. Require a report under 250 words: what changed, any
user-visible behaviour change, harness result, commit hash.

## 5. Review what the phases could not see

Before declaring done, spend two agents:

- **an independent regression review** of the whole diff against the merge base,
  hunting only for correctness regressions — a field a route used to accept,
  a default that leaked, a state a screen used to render
- **the e2e suite** against the local stack

Consolidating schemas is where regressions hide: the web client always sends the
affected fields, so CI stays green while another client breaks. Fix what the
review finds, with a test each, before you report.

## 6. Report

Lead with the verification table and the behaviour changes a user would notice.
Say plainly what was left undone and why. A phase that was skipped is the
user's call to make, not yours to bury.
