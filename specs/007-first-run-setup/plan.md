# Implementation Plan: First sign-in asks for your rate, and the invoice asks for the rest

**Branch**: `f382-onboarding` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-first-run-setup/spec.md`

## Summary

Three web-only pieces. The Inbox gains a rate row whenever
`default_hourly_rate` is null, carried on `/stats` `attention` like every
other row. Home opens a two-step welcome dialog while the new
`user_settings.welcomed_at` is null; a migration backfills every existing row
so only new accounts see it. New invoice shows a notice while business name
or email is empty, whose "Add details" opens a dialog that patches settings,
and invoice creation refuses on the server while either is empty.

## Technical Context

**Language/Version**: TypeScript, React 19, Next.js App Router; SQL (Postgres)

**Primary Dependencies**: `radix-ui` Dialog (`components/ui/dialog.tsx`), TanStack Query, zod (`@stint/schema`), Tailwind 4

**Storage**: Supabase Postgres; one new nullable column on `user_settings`

**Testing**: `apps/web/test/routes.test.ts` (real Postgres), `test/mocks-parity.test.ts`, Storybook stories in a real browser

**Target Platform**: The web app, desktop and phone widths. macOS unchanged: its `Codable` settings ignore the new key.

**Project Type**: Web application

**Performance Goals**: Every press answers in the same frame (Constitution VI)

**Constraints**: No new fixed cost; no Server Actions; nothing saved on the user's behalf

**Scale/Scope**: One migration, three routes touched, three new components, four components touched

## Constitution Check

| Principle | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Every field starts empty; placeholders are never saved. A client rate equal to the default is kept as entered. The backfill writes only `welcomed_at`, a flag about the app, not user data. |
| II. Logic written twice has a parity test | No | "No rate" is one check in the stats route; the client reads the flag. |
| III. Every client through `/api/v1` | Yes | Rate, welcome flag and business details go through `PATCH /settings`; the client through `POST /clients`. Invoice creation enforces name and email on the server, not only in the disabled button. |
| IV. `packages/core` does no I/O | No | Nothing goes into core. |
| V. Tests first where a regression is silent | Yes | Route cases first: settings round-trips `welcomedAt`; a new account's `welcomedAt` is null; `/stats` carries `noDefaultRate`; `POST /invoices` refuses without business name or email. Each visible state is a story (see Project Structure). |
| VI. Every press answers in the same frame | Yes | All writes use `useOptimisticMutation`. The rate row leaves at once (reversible). "Next" moves to step 2 at once. "Start tracking" and the business dialog's Save are validated by the server, so they show a pending state. |

Additional Constraints: no new table, so no new RLS policy; `user_settings`
keeps its policies. Money stays `numeric(12,2)`.

Post-design re-check: passes; nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-first-run-setup/
├── spec.md
├── design/first-run.html
├── plan.md
├── research.md
├── data-model.md
├── contracts/api.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/
└── 00000000000036_welcomed_at.sql       # NEW: column, backfill existing rows
supabase/seed.sql                         # seeded account is welcomed
apps/web/e2e/reset-seed.sql               # e2e account is welcomed
packages/schema/src/index.ts              # Settings.welcomedAt; attention.noDefaultRate
apps/web/src/lib/rows.ts                  # SETTINGS_COLUMNS / toSettings / SETTINGS_FIELDS
apps/web/src/app/api/v1/stats/route.ts    # attention.noDefaultRate
apps/web/src/app/api/v1/invoices/route.ts # refuse without business name or email
apps/web/src/mocks/fixtures.ts            # welcomedAt; no-rate and no-business accounts
apps/web/src/components/
├── inbox.tsx                  # rate row kind; inboxCount counts it
├── home.stories.tsx           # rate row: no rate, among others
├── step-dialog.tsx            # NEW: dialog with step bars, "Step n of m", Back
├── welcome-dialog.tsx         # NEW: the two steps, mounted by Home
├── welcome-dialog.stories.tsx # NEW: one story per design state
├── home.tsx                   # mounts WelcomeDialog while welcomedAt is null
├── business-dialog.tsx        # NEW: name, email, address; Save patches settings
├── invoice-new.tsx            # notice, Add details, Generate disabled
├── invoice-new.stories.tsx    # details missing, dialog open
└── settings-form.tsx          # rate placeholder 100.00
apps/web/test/routes.test.ts
```

**Structure Decision**: `StepDialog` is its own part because it is the new
component the design names; `WelcomeDialog` holds only the two steps' fields
and writes. `BusinessDialog` is separate from `invoice-new.tsx`, which is
already long, the same way `PaymentProfileDialog` is.

## Complexity Tracking

None.
