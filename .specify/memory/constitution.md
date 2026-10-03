# Stint Constitution

The gate every plan passes before it's built. `docs/positioning.md` owns who
this is for and what it costs; this file owns how a feature may be designed.

A principle is here only because a plan has broken it, or plausibly would,
and nothing in the code would say so before the design is built. A rule the
code enforces as it runs lives at that code instead.

## Core Principles

### I. The app never silently modifies user data

A suspect record is surfaced for the user to resolve, never corrected on
their behalf, even when the correction would be right: an overlap merged, a
rate guessed, a timestamp nudged. Imports write through and flag; an
optimistic update never rewrites what the user entered. The inbox
(`apps/web/src/components/inbox.tsx`) is where a suspect record goes.

### II. Logic written twice has a parity test against a real database

Prefer calling the one implementation. When a rule must exist in both
TypeScript and SQL, as rate resolution does (`resolveRate()` bills,
`resolve_rate()` rolls up), a test against real Postgres proves both agree
for every input, zero included (`apps/web/test/rates.test.ts`).

### III. Every client goes through `/api/v1`, and the server owns timer truth

Business logic lives behind the HTTP API, so the web and macOS apps share one
implementation. No Server Actions, even for a form only the web has. A client
may show a predicted result at once, but the server's answer wins.

### IV. `packages/core` does no I/O

Parsing, rates, invoice lines and time math are pure functions in
`packages/core`: no `next`, no `@supabase/*`, no network or file access. The
route handler reads and writes; core transforms.

### V. Tests first where a regression is silent, in one suite per kind of code

A test goes before the code wherever a mistake would reach a user unseen:
money, a write, a route, a policy, sign-in, and the logic in
`packages/core` and on the client. Each kind of code has its suite:

| Code | Suite |
| --- | --- |
| A route handler | `apps/web/test/routes.test.ts`, against real Postgres |
| A table | RLS enabled with policies, and a cross-user case in `apps/web/test/rls.test.ts` |
| `packages/core` | `packages/core/test` |
| Client logic: a hook, a form's rules | `apps/web/test/ui` |
| A screen, and each state a user can see | its `*.stories.tsx`, one story per acceptance scenario |
| Sign-in and invoicing, end to end | `apps/web/e2e` |

A bug fix starts with the test that reproduces it, in its code's suite. How
a screen looks is reproduced by its story, which CI renders in a real
browser; no jsdom test asserts it. Tooling, docs, config and dependency
bumps carry no test of their own unless they carry logic.

### VI. Every press answers in the same frame

Nothing waits silently on the server. A press whose result is known and
can be taken back shows that result at once; one the server decides (a
validated form, a generated invoice) or that can't be taken back (a send, a
delete, money) shows a pending state on the control instead. Never neither.

Every write goes through one mechanism per platform —
`useOptimisticMutation` (`apps/web/src/lib/client/mutations.ts`) or the
`Optimistic` protocol's `press` (`apps/macos/Sources/Stint/Optimistic.swift`)
— which gives both the same rules: overlapping presses let the latest win,
a timer's presses reach the server in press order, a silent server fails a
prediction after 10s, and a late answer refetches. A pending press has no
bound, because "try again" on a write that landed could make it twice.
`apps/web/scripts/check-mutation-usage.mjs` fails a web file that imports `useMutation`, with
no opt-out; on macOS the PR checklist asks.

The server stays the truth (Principle III): the refetch after the last press
replaces every prediction. A rejection takes the prediction back and says
why — in the form that stays open, otherwise in the app-wide notice, which
outlives the screen that pressed — never silently (Principle I).

A section switches without a server round trip: its route is static, and
`(app)/loading.tsx` answers any route that isn't.

## Additional Constraints

Facts a design works around:

- **One running timer per user**, enforced by the index
  `one_running_timer_per_user`. An import or sync never writes a second open
  entry.
- **An issued invoice and the entries it bills are immutable.** A correction
  is void and reissue. Money is `numeric(12,2)`.
- **Record ids are client-generated** (`uuidv7()` in `@stint/core`), so a
  retried insert lands on the same row.
- **Clients and projects are archived, never deleted**; invoices reference
  them.
- **No new fixed cost.** Vercel Pro and Supabase Pro are the whole overhead
  (`docs/positioning.md`); an always-on service or a paid tier changes
  positioning first.
- **Online-only, US-first**, on Next.js route handlers, Supabase Postgres
  with RLS, and a native Swift macOS app (`docs/architecture.md`).

## Development Workflow

An unexpected error is never swallowed: a `catch` handles a failure it
expects, and rethrows anything else.

## Governance

A plan that must break a principle records why in its Complexity Tracking
table, and the reviewer decides; it doesn't proceed silently. A new
principle names where it came from, the decision it has changed or would
change, the plausible design that breaks it, and why no check catches that
in time. The version follows semver: MAJOR removes or redefines a principle,
MINOR adds one, PATCH rewords. The reasoning goes in the PR.

**Version**: 8.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-10-03
