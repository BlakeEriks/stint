# Stint Constitution

The bar every spec, plan and pull request is checked against.
`docs/positioning.md` owns who this is for and what it costs, and wins any
conflict about the product. This file wins on how the code is held.

Each principle names its **mechanism**: the check that fails when the
principle is broken. Where the check isn't built yet, a `TODO(#issue)` says
so. A rule that only review enforces says that too.

Part 2's categories come from DORA's continuous-delivery capabilities, OWASP
ASVS level 1 and Spec Kit's constitution template. A category with no
principle is a gap, not a pass.

## Part 1: Product

### I. One contractor, getting paid

Every feature answers yes to one question: does this help one contractor
track time and get paid? The subject is one person, so nothing is built for a
team. The object is getting paid, so being useful isn't enough.

**Mechanism**: the Feature issue form's four questions, then this check in
`/speckit-plan`.

### II. The app never silently modifies user data

A suspect record is surfaced for the user to resolve, never corrected on
their behalf. This holds even when the correction would be right: the user
can't tell it happened, and then no number in the app can be trusted. An
auto-rounded rate, a guessed field, or a timestamp nudged to clear a
conflict breaks this.

**Mechanism**: the inbox (`apps/web/src/components/inbox.tsx`) is the one
surface for suspect records, which the user clears by editing or confirming
them. A feature that builds its own correction path fails review.

### III. Preview before anything irreversible

An action that can't be undone, such as generating an invoice (it allocates
a gapless number and locks entries), is preceded by a preview with no side
effects, built from the same code.

**Mechanism**: `apps/web/test/invoices.test.ts` asserts that preview writes
nothing and agrees with generation.

### IV. A figure that moves must be true

Every number the app shows is computed from the user's records. Collected,
awaiting and unbilled are three stages of one pipeline, and no two are ever
summed, because any sum double-counts the same hours. There are no metrics
invented to produce a feeling, such as streaks or scores.

**Mechanism**: review.

### V. The web is where features are built

Every capability lands on the web first. A native app does only what only it
can do: on macOS, menu bar presence and the timer; on mobile, starting and
stopping away from the desk. The surfaces table in `docs/architecture.md`
sets each app's ceiling.

**Mechanism**: review against that table.

## Part 2: Engineering

### Data integrity

#### VI. One running timer per user, enforced by the database

The partial unique index `one_running_timer_per_user` on
`time_entries (user_id) where ended_at is null` makes overlap impossible.
Nothing may bypass it. Time entry ids are client-generated UUIDv7
(`uuidv7()` in `@stint/core`), so a retried insert lands on the same row.

**Mechanism**: the index itself, and `pnpm verify:schema` fails if it's
missing or isn't partial.

#### VII. Money is exact, and an issued invoice never changes

Money is `numeric(12,2)` in every table, never a float. Rates and payment
details freeze onto an invoice at generation, and an issued invoice and the
entries it bills are immutable. Clients and projects are archived, never
deleted, because invoices reference them.

**Mechanism**: the immutability triggers in
`supabase/migrations/00000000000002_integrity.sql`, exercised by
`apps/web/test/invoices.test.ts`. `TODO(#143)`: `verify:schema`
doesn't check column types yet.

#### VIII. Logic written twice has a parity test against a real database

Rate resolution exists as `resolveRate()` in TypeScript (it bills) and
`resolve_rate()` in SQL (it rolls up). Any logic with the same shape has a
test showing both give the same result for every input combination. That
includes zero: `0` is a valid rate, so the chain uses null-coalescing, never
truthiness.

**Mechanism**: `apps/web/test/rates.test.ts`, under `pnpm verify:db`.

### Security

#### IX. Row-level security is on, and proven correct

Every table has RLS enabled, and every function `anon` can reach has an
explicit `grant execute`. Every table that holds user data has a test showing
one user can't read, update or delete another's rows. The test
authenticates as the `authenticated` role, never as a role that bypasses
RLS.

**Mechanism**: `pnpm verify:schema` in CI and in the release gate against
production, plus `apps/web/test/rls.test.ts` (`pnpm test:rls`).

#### X. Every route authenticates the same way, and no secret is committed

Every `/api/v1/*` route calls `requireSession()` and answers errors with the
`ApiError` shape (`apps/web/src/lib/errors.ts`). A committed credential
breaks the build.

**Mechanism**: the required `scan` check runs gitleaks over full history,
CodeQL scans each PR, and Dependabot raises weekly updates.
`TODO(#144)`: an unsigned request to every route is
refused.

### Boundaries

#### XI. Every client goes through `/api/v1`

Business logic lives behind the HTTP API, so the web and native clients
share one implementation. There are no Server Actions. The server owns
timer truth, and clients own responsiveness: a client may show a predicted
result at once, but the server's answer wins.

**Mechanism**: `TODO(#139)`: nothing fails on `'use server'`
yet.

#### XII. `packages/core` does no I/O

Everything in `packages/core/src` is pure: it never imports `next`,
`@supabase/*`, or anything that touches the network or the file system. An
expected absence returns `null` rather than throwing. That purity is what
lets VIII run the same logic against SQL in one test.

**Mechanism**: `TODO(#140)`.

### Change safety

#### XIII. A change ships for the client that hasn't updated

The web deploys on merge, but the macOS app updates when its user chooses
to. Migrations are additive and forward-only: a new column is nullable or
defaulted, and no shipped column is dropped, renamed or narrowed. Retiring a
column takes two releases. API responses follow the same rule: a field a
shipped client reads isn't removed, renamed or retyped.

**Mechanism**: `release.yml` flags destructive SQL before approval.
`TODO(#141)`: CI doesn't fail on it yet.
`TODO(#142)`: no OpenAPI diff guards responses yet.

### Cost posture

#### XIV. No new fixed cost

The whole overhead is Vercel Pro and Supabase Pro, and that's what the price
covers (`docs/positioning.md`). A design that adds a fixed monthly cost, such
as an always-on service or a paid vendor tier, changes positioning first.

**Mechanism**: review.

### Test obligations

#### XV. Each kind of code has its suite

| Code | Suite |
| --- | --- |
| A route handler | `apps/web/test/routes.test.ts`, against real Postgres |
| A table | `apps/web/test/rls.test.ts` |
| Logic written twice | `apps/web/test/rates.test.ts` (VIII) |
| `packages/core` | `packages/core/test`, above a coverage floor |
| A component | a sibling `*.stories.tsx`, run by the `stories` check |
| Sign-in and invoicing, end to end | `apps/web/e2e` |

A bug fix starts with the test that reproduces it.

**Mechanism**: `TODO(#144)`: nothing fails CI when a route,
table or component has no test. `TODO(#145)`.

### Accessibility

#### XVI. Every story passes its a11y check

**Mechanism**: the `stories` check.

### Delivery

#### XVII. `main` is always releasable, and a release proves itself first

Every required check passes before a merge, and a red `main` gets fixed
before anything else. A merge deploys, but Vercel holds the build unaliased
until the release gate has migrated production and verified the schema. A
release with a migration waits for approval and a backup. Backups run
nightly, and the restore has been rehearsed (`docs/deploying.md`).

**Mechanism**: branch protection, `release.yml` and `backup.yml`.
`TODO(#146)`: the gate doesn't yet hit the candidate build before
promoting it.

### Observability

#### XVIII. An unexpected error reaches us before a user reports it

Expected failures answer with `ApiError`. An unexpected one, on the web or
in the macOS app, is reported with its stack and alerts `#alerts`. The app's
health is checked from outside.

**Mechanism**: `TODO(#147)`: Sentry and an uptime monitor.

## Governance

**Amendments.** A new principle names its category, its mechanism (or a
`TODO(#issue)`), and the line in `docs/positioning.md` or the incident it
traces to. A preference that fails this goes to `.claude/rules/` as a
convention that can change freely. A feature that needs a new principle
amends this file in its own PR. The version follows semver: MAJOR removes or
redefines a principle, MINOR adds one, and PATCH rewords. The reasoning goes
in the PR, never in this file.

**Compliance.** A plan or implementation that conflicts with a principle is
a defect in the plan. Stop and surface it; don't weigh it.

**Version**: 4.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-28
