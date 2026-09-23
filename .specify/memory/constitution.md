<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0 → 2.1.0 → 2.2.0 → 2.3.0 → 3.0.0
- v2.0.0 through v2.3.0: see prior report, preserved in git history.
- v3.0.0 (MAJOR — four new principles, renumbering existing ones): an
  outside review found the six existing principles cover data integrity,
  schema shape, API surface, dual-write parity, non-destructive writes, and
  I/O purity — but nothing governs authorization *correctness* (as opposed
  to RLS being merely enabled), secrets, observability, or migration
  rollout safety across independently-deployed clients. Each gap was
  checked against the actual repo before being written, per this
  document's own rule that a principle without a mechanism is a hope:
  - Authorization correctness: apps/web/test/rls.test.ts already exists
    and is real (cross-user isolation tests against a real RLS-enabled
    Postgres, run as `pnpm test:rls` in CI) — promoted to a named
    Principle rather than left implicit under II's "RLS enabled" check,
    because "enabled" and "correct" are different claims.
  - Secrets: .gitleaks.toml + .github/workflows/gitleaks.yml already run
    on every push and PR — promoted to a Principle for the same reason.
  - Observability: nothing exists beyond bare `console.error` in
    apps/web/src/lib/errors.ts. Stated as TODO(ERROR_TRACKING) rather than
    invented.
  - Migration rollout across clients: .claude/rules/migrations.md already
    states a real, detailed policy (additive-only, two-release column
    retirement) but it is a review rule, not a script — verify:schema
    checks shape, not rollout safety. Stated with the real mechanism
    (verify:schema) named for what it actually covers, and TODO for the
    rest.
  - Rejected as a new principle: API versioning/deprecation (no v2 exists
    yet, nothing to state beyond a TODO with no principle to hang it on —
    revisit when v2 is real) and a general "testing bar" principle
    (already extensive per-suite coverage exists but no per-route
    enforcement gate; folding it into Principle IV's dual-write scope
    would blur that principle's actual claim, so left out rather than
    stated loosely).
  - docs/api.md line 3 claims "web, Expo, Swift" as the three clients;
    no Expo app exists in this repo. Not a constitution concern, flagged
    to the user as a doc accuracy issue instead.
- Deferred TODOs (carried forward, unchanged):
  - TODO(SERVER_ACTIONS_LINT): a biome rule banning 'use server' outside an
    allowed path does not exist yet. Principle III states the rule and this
    gap explicitly rather than implying enforcement that isn't there.
  - TODO(CORE_PURITY_LINT): a lint rule banning imports of 'next',
    '@supabase/*', or any I/O-performing package inside packages/core/src
    does not exist yet. Principle VI states the rule; the check is future
    work.
- New deferred TODOs (v3.0.0):
  - TODO(ERROR_TRACKING): no structured logging or error-tracking service
    exists. Principle VIII states the gap rather than implying a mechanism
    that isn't there.
  - TODO(MIGRATION_ROLLOUT_CHECK): no automated check verifies a migration
    is safe for a client on the previous schema version to keep running
    against. Principle IX names the real mechanism for shape/RLS and the
    gap for rollout safety.
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

### VII. Row-Level Security Is Verified Correct, Not Merely Enabled

Principle II asserts every table has RLS *on*. That is a different claim from
RLS being *right* — a policy can exist and still leak: a missing `USING`
clause, a policy scoped to the wrong column, a forged `user_id` accepted on
insert. Every table holding user data MUST have a test proving one user
cannot read, update, or delete another user's rows through it, run against a
real Postgres instance authenticating as the `authenticated` role — never as
a superuser or RLS-bypassing connection, which would pass trivially. A table
added without this test is unverified, regardless of what `verify:schema`
reports.

**Mechanism**: `apps/web/test/rls.test.ts`, run as `pnpm test:rls` in CI
(`database` job, `.github/workflows/ci.yml`) against a dedicated RLS-enabled
database, authenticating via a per-transaction JWT claim the way PostgREST
does. A new table without an equivalent cross-user case in this file has not
met this principle.

### VIII. A Secret Committed Is a Broken Build, an Unhandled Error Is a Silent One

No credential, key, or connection string that grants write access or bypasses
RLS may reach version control — not "should be caught in review," a build
that contains one is broken the moment it's pushed. Separately, and today
less completely enforced: an error the app doesn't expect MUST be
distinguishable from one it does, so a failure can be found before a user
reports it rather than after.

**Mechanism (secrets)**: `.gitleaks.toml` (scoped allowlist for known
placeholders) enforced by `.github/workflows/gitleaks.yml` on every push to
`main` and every PR, scanning full history. A commit containing a real
secret fails this workflow, not a reviewer's eye.

**Mechanism (errors)**: none yet beyond `apps/web/src/lib/errors.ts`
producing a structured `ApiError` response shape for *expected* failures.
An unexpected exception currently reaches only `console.error`, which is not
monitored. `TODO(ERROR_TRACKING)` — no structured logging or error-tracking
service exists; an unhandled exception in production is invisible until a
user reports the symptom. Stated now rather than implied, because this gap
is the difference between finding a production bug in an hour and finding
it in a support message.

### IX. A Migration Ships for the Client That Hasn't Updated Yet

Web deploys the moment `main` merges; the Swift app waits on App Store
review and a user choosing to update. A migration that assumes every client
is on the new schema the moment it lands breaks the Swift client running
against the old one for however long review takes. Migrations MUST be
additive and forward-only — new columns nullable or defaulted, no dropped or
renamed column that has shipped, no narrowed type — and retiring a column is
two releases: stop writing it, ship, confirm nothing reads it, then drop it
later, never in the migration that changes the code. A destructive change is
only permitted against schema that has never reached production.

**Mechanism**: `scripts/verify-schema.mjs` (`pnpm verify:schema`) asserts
shape and RLS are correct after a migration runs, and runs again by the
release gate against the hosted project before a deploy is unaliased
(`docs/deploying.md`). It does not verify that the migration was safe to
ship *while an older client is still running* — that discipline is stated
in `.claude/rules/migrations.md` and enforced by review, not by a script.
`TODO(MIGRATION_ROLLOUT_CHECK)` — no automated check exists that would
catch a dropped or narrowed column before it reaches a client that hasn't
updated.

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
the implementing agent — stop and surface it. `/speckit-analyze` checks that
`spec.md`, `plan.md`, and `tasks.md` agree with each other and with this
constitution — internal consistency, nothing further. Whether a decision
behind a spec was the right one is settled before a feature reaches this
workflow at all, by a process this document does not govern.

**Version**: 3.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-23
