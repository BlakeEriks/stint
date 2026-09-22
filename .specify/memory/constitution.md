<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- Rationale for MAJOR: v1.0.0 restated design/positioning beliefs that
  already live in positioning.md and principles.md. This version replaces
  every restated belief with structural law — a rule that names the
  mechanism enforcing it, or states plainly that none exists yet. That is a
  redefinition of what a "principle" in this document is, not an addition.
- Modified principles: all — rewritten from belief-statements to
  mechanism-backed rules, following the shape of a sibling project's
  constitution (BL-API) the user supplied as the bar to hit.
- Added: Principle II (schema invariants), IV (parity testing), VI (packages/core
  purity), the Main Branch Bar governance rule, the Server Actions enforcement
  gap named as a TODO.
- Removed: the prior five principles that restated positioning.md/principles.md
  verbatim (single-user scope, free-tracking-paid-invoice, simplicity-as-
  instruction) — those remain true and are cited by reference in Doc
  Ownership, not repeated here as "principles" with no mechanism.
- Templates requiring updates: none yet — no specs/plans exist against v1.0.0
  to re-validate.
- Deferred TODOs:
  - TODO(SERVER_ACTIONS_LINT): a biome rule banning 'use server' outside an
    allowed path does not exist yet. Principle III states the rule and this
    gap explicitly rather than implying enforcement that isn't there.
  - TODO(CORE_PURITY_LINT): a lint rule banning imports of 'next',
    '@supabase/*', or any I/O-performing package inside packages/core/src
    does not exist yet. Principle VI states the rule; the check is future
    work.
-->

# Stint Constitution

This constitution governs the Stint repository: a Next.js App Router web app,
Supabase (Postgres + RLS + Auth) on Vercel, a native Swift menu bar app, and
a shared `packages/core` used by both. `CLAUDE.md`, `docs/positioning.md`,
and `docs/design/principles.md` remain canonical for what the product is,
who it is for, and what it costs — this document does not restate their
claims. It states how code is held to a structural bar, the way `positioning.md`
states the thesis. **A principle here without a named mechanism is not a
principle, it is a hope** — say so explicitly (as a TODO) rather than let a
belief masquerade as an enforced rule.

## Core Principles

### I. The Timer Invariant Is Enforced by the Database, Not by Code

At most one running entry per user. This MUST be a database constraint —
the partial unique index `one_running_timer_per_user` on
`time_entries (user_id) where ended_at is null` — never application logic
alone. No code path, migration, or bulk-write operation may be added that
could produce two open entries for one user; if a new write path cannot
prove it respects the index, the index itself is the test.

**Mechanism**: `one_running_timer_per_user` (partial unique index,
`supabase/migrations/00000000000001_schema.sql`). A violation is a
constraint failure at the database, not a review finding.

### II. Schema Invariants Are Asserted Every Build, Not Assumed

Every table has row-level security enabled. Every function `anon` can reach
carries an explicit `grant execute`, verified rather than inferred — a
missing role does not crash the check, and a trigger or event-trigger
function is exempt because privilege is never consulted when one fires.
Neither invariant is optional, and neither is caught by TypeScript, Biome,
or a human skimming a migration diff.

**Mechanism**: `scripts/verify-schema.mjs`, run as `pnpm verify:schema` in
CI (`.github/workflows/ci.yml`) and again by the release gate
(`docs/deploying.md`) against the hosted project before a deploy is
unpaused. A new migration that adds a table or a function without
satisfying this is a broken build, not a follow-up.

### III. Server Boundary — Stated, Partially Enforced

No Server Actions for anything the Expo or Swift clients also need —
everything crosses `/api/v1/*` Route Handlers, so one implementation serves
every client rather than three. `apps/web/src/lib/errors.ts`'s `ApiError`
shape (`{code, message, details}`) and `apps/web/src/lib/auth.ts`'s
`requireSession()` are the two things every route MUST use — not a
route-specific reimplementation of either.

**Mechanism**: none yet. `TODO(SERVER_ACTIONS_LINT)` — a `'use server'`
directive outside an allowed path is currently a reviewer catch, not a
build failure. This is stated as a gap deliberately: a rule with no
mechanism that is written as though one exists is worse than an honest
TODO, because it teaches the next reader the rule is optional.

### IV. Anything Written Twice MUST Have a Parity Test Against a Real Database

Rate resolution exists in two places — `resolveRate()` in TypeScript and
`resolve_rate()`/`resolve_entry_rate()` in SQL — because the invoice PDF and
the home screen's rollups cannot share one runtime. Any future logic with
the same shape (computed once for display, once for what actually bills or
what actually persists) inherits the same obligation: a test asserting
every input combination — including the zero case, which a truthiness bug
hides — produces the identical result from both implementations, run
against a real Postgres instance, not a mock.

**Mechanism**: `apps/web/test/rates.test.ts`, run under `pnpm verify:db`.
The next dual-written rule that ships without an equivalent test is
incomplete, not merely under-tested.

### V. The App Never Silently Modifies User Data

A suspect record — an implausible duration, an overlapping entry, an
unrated line — is surfaced for the user to resolve, never corrected
automatically. This applies uniformly regardless of how confident an
inference is: a feature that would auto-round a rate, guess a missing
field, or silently adjust a timestamp to resolve a conflict is a violation
of this principle, not an optimization.

**Mechanism**: the inbox (`docs/design/screens/inbox.html`) is the general
surface for this — one row per suspect record, cleared by the user editing
the record or explicitly confirming it, never by the system deciding on
their behalf. A feature that invents its own silent-correction path instead
of routing through the inbox pattern has not followed this principle
because it built a second mechanism the constitution does not name.

### VI. `packages/core` Has No I/O

`packages/core/src/**` MUST NOT import `next`, any `@supabase/*` package,
or anything else that performs network or file I/O. Every exported function
is pure: typed input in, typed output out, no thrown exceptions for an
expected absence (a rate that does not resolve returns `null`, not an
error) — the same discipline `buildLineItems()` and `resolveRate()` already
follow. This is what lets the same logic run inside a Route Handler today
and inside a different runtime later without a rewrite, and what makes
Principle IV's parity tests possible at all — a function with hidden I/O
cannot be run twice, once in TS and once compared against SQL, inside one
test.

**Mechanism**: none yet. `TODO(CORE_PURITY_LINT)` — this is currently true
by convention, not by a lint rule banning the import. Stated now, before a
second consumer of `packages/core` exists, so the rule is inherited rather
than retrofitted.

## Doc Ownership — Where a Claim Belongs

Every claim about the product lives in exactly one place. A spec, plan, or
task file produced under this constitution MUST NOT restate a claim one of
these already owns — it cites the doc instead.

| The claim is | It belongs in |
| --- | --- |
| The thesis, competitors, price | `docs/positioning.md` (always wins on conflict) |
| What we believe about the product, and the trust rule behind Principle V | `docs/design/principles.md` |
| One screen or one app | that screen's doc under `docs/design/screens/`, or `docs/macos.md` |
| A shape a screen is assembled from | `docs/design/screens/components.html` |
| How to run, build, or deploy | `docs/local-dev.md`, `docs/deploying.md`, `docs/setup.md` |
| The data model and rate/invoice-numbering chains | `docs/data-model.md` |
| Enforced by a check or config, beyond what's named above | that script or config, commented at the line someone edits |
| Unbuilt work | `docs/roadmap.md` — gated by four questions (whose problem, what happens without it, does it serve the one person, which milestone) |
| A known fault | `docs/defects.md` |
| True only under one path in the tree | `.claude/rules/<topic>.md`, with `paths:` frontmatter |
| What constrains code anywhere in the repo, beyond this constitution's structural rules | `CLAUDE.md`, under 200 lines by design |

A Spec Kit `spec.md` for a feature that is not yet a `roadmap.md` line has
not passed the gate. Write the roadmap entry first.

## Conventions & Jurisdiction

Time entry ids are client-generated UUIDv7 so a retried insert is
idempotent — this is Principle I's idempotency counterpart, not a separate
concern. `0` is a valid rate; every rate-chain comparison uses
null-coalescing, never truthiness (this is exactly the bug Principle IV's
parity tests exist to catch). Money is `numeric(12,2)`, never a float, in
every table that holds it. Archive, don't delete — invoices reference
clients and projects.

**This product is built from a US point of view.** USD, US date and number
formats, US banking rails (ACH routing + account number, checks), US tax
framing (1099, W-9, no VAT, `tax_rate` defaults to 0). International support
is additive, never the baseline, and is never inferred from sample data or
a developer's current location.

**Never point local dev at production.** `pnpm migrate` and
`pnpm verify:schema` reach the hosted project and are never run by hand
against it — a merge deploys, and the release gate migrates and verifies
before aliasing (Principle II's mechanism, applied to production). A new
worktree is made with `pnpm worktree <branch>`, never `git worktree add`.

## Governance

This constitution supersedes ad-hoc practice for anything it states. It
does not supersede `CLAUDE.md`, `docs/positioning.md`, or
`docs/design/principles.md` for claims about the product itself — this
document's scope is structural law for code, not product thesis. Where this
file and one of those disagree after a later edit to either, the source
document wins for product claims, and this file wins for build/schema/test
discipline; a genuine conflict between the two kinds is a defect in this
file to be fixed, not a tiebreak to guess at.

**The main branch bar.** `main` is never in a state where the next person —
human or agent — inherits a broken build. `pnpm verify:static` and
`pnpm verify:db` MUST be green, with no new lint or type warnings, before
any commit reaches `main` — not only before a push. This is stricter than
"never push without permission" (a rule about who authorizes outbound
traffic); this is a rule about what state the branch is allowed to hold
regardless of who's asking to push it. A red `main` is a defect to fix
immediately, not a task to schedule.

**Amendments**: propose a change naming the specific principle or section
affected and the rationale. Bump `CONSTITUTION_VERSION` by semantic
versioning — MAJOR for a backward-incompatible principle removal or
redefinition, MINOR for a new principle or materially expanded guidance,
PATCH for wording and clarification. Update `LAST_AMENDED_DATE`. A
principle added without a named mechanism MUST carry a `TODO(...)` stating
what's missing — an amendment that adds an unenforced rule silently is not
valid.

**Compliance**: a `/speckit-plan` or `/speckit-implement` run that conflicts
with a Core Principle above is a defect in the plan, not a judgment call for
the implementing agent — stop and surface it. A branch that decides
something (a price, a scope cut, a milestone order) still gets `/dissent`
before merge, per the project's existing convention; `/speckit-analyze` is
a complement to that, not a replacement.

**Version**: 2.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-22
