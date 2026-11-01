# Implementation Plan: The account has a billing time zone

**Branch**: `billing-tz` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-billing-time-zone/spec.md`

## Summary

One nullable IANA zone column, `user_settings.billing_time_zone`. One pure
rule in `@stint/core`, `billingZone(account, device)`, picks the account's,
else the device's: the server calls it when it previews, generates or edits
an invoice, and New invoice calls it for the issue date and the suggested
period it shows, and the Inbox's ready-to-invoice row (#548) reads it too. A draft
still stores the zone it was generated in (`invoices.tz`) and keeps it until
sent. A backfill migration sets each account's zone from its newest
invoice; the welcome dialog sets an unset one to the device's. The Inbox's
late-entry row reads each sent invoice's own zone.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migrations

**Primary Dependencies**: `isValidTimeZone`, `localDateKey`, `billingWindow` in `@stint/core`; Zod in `@stint/schema`; `Intl.supportedValuesOf('timeZone')` and a new `Combobox` (shadcn's Popover + Command, adding `cmdk`) for the picker

**Storage**: Supabase Postgres: one column on `user_settings`, a backfill

**Testing**: `packages/core/test` (the rule, DST windows), `apps/web/test/invoices.test.ts` and `routes.test.ts` (private DB), `apps/web/test/ui` (New invoice's dates), Settings stories

**Target Platform**: The web app. The macOS and phone apps create no invoices; their decoders ignore the new key.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: None new; the column rides on reads `computeInvoice` already makes

**Constraints**: Issued invoices never change; backfill separate from DDL (`.claude/rules/migrations.md`); no fixed cost

**Scale/Scope**: Settings, the welcome dialog, New invoice, `POST /invoices`, `PATCH /invoices/:id`, `POST /invoices/preview`, stats' late entries

## Constitution Check

| Principle | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | No draft or invoice is rewritten: each keeps the zone it was made in. The backfill copies a zone the user's own invoices already used, never a guess; an account with none stays unset and behaves as today. |
| II. Logic written twice has a parity test | No | The rule is one TypeScript function; SQL never resolves a zone. |
| III. Every client through `/api/v1` | Yes | The server resolves the zone itself; New invoice's dates are a prediction its preview settles. |
| IV. `packages/core` does no I/O | Yes | `billingZone()` is pure. |
| V. Tests first where a regression is silent | Yes | Core: the rule's order; a window across a DST change. Routes: generation from Lisbon and Los Angeles bills the same entries; the issue date is read in the billing zone; an edit from another zone keeps it; settings' zone round-trips and refuses a bad one; late entries read each invoice's zone. UI: New invoice's issue date in the billing zone. Stories per field state. |
| VI. Every press answers in the same frame | Yes | Settings autosaves as today. |

Additional constraints: issued invoices immutable (no write to `invoices`);
no new fixed cost.

## Project Structure

### Documentation (this feature)

```text
specs/015-billing-time-zone/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/api.md
```

### Source Code (repository root)

```text
packages/core/src/billable.ts         billingZone()
packages/schema/src/                  Settings.billingTimeZone
supabase/migrations/                  add column → backfill
apps/web/src/lib/rows.ts              settings mapping
apps/web/src/lib/drafts.ts            computeInvoice resolves the zone
apps/web/src/app/api/v1/invoices/     route.ts, preview/route.ts, [id]/route.ts use it
apps/web/src/lib/stats.ts             late entries in each invoice's zone
apps/web/src/components/              ui/combobox, ui/popover, ui/command (new), zone-select (new), settings-form, welcome-dialog, invoice-new
apps/web/src/mocks/                   fixtures, handlers
docs/api.md, docs/data-model.md
```

**Structure Decision**: Existing monorepo layout; no new package or route.

## Complexity Tracking

None.
