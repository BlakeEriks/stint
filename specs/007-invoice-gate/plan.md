# Implementation Plan: Gate the invoice document

**Branch**: `f61-invoice-gate` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-invoice-gate/spec.md`

## Summary

`GET /api/v1/invoices/:id/pdf` decides, before rendering, whether the
document opens, and answers `402 PAYMENT_REQUIRED` when it doesn't. One
pure function in `packages/core`, `documentOpens()`, holds the rule: open
while billing is dark, for a paying user, or for an invoice generated while
paying. "Generated while paying" is recorded on the invoice by a database
trigger that copies the stored subscription status at insert, so no client
can forge it and nothing later can change it. `GET /invoices/:id` returns
the same answer as `canDownload`, and the detail screen shows Subscribe to
download in place of Download PDF and Preview when it is false. Previewing
and generating are untouched.

## Technical Context

**Language/Version**: TypeScript, Next.js route handlers, React 19; SQL migration

**Primary Dependencies**: `entitlement()` and `planOf()` from #60; Zod in `@stint/schema`

**Storage**: Supabase Postgres: one column on `invoices`, `issued_subscription_status`, set by a trigger

**Testing**: `routes.test.ts` (private DB via `scripts/ci-db.sh`), `rls.test.ts` (the column can't be forged), `packages/core/test`, an invoice-detail story for the locked state

**Target Platform**: The web app. The macOS app doesn't open invoices.

**Project Type**: Web service and client in the existing monorepo

**Performance Goals**: One extra single-row read per document request

**Constraints**: Gate open while billing is unconfigured; never touches Stripe; no fixed cost

**Scale/Scope**: Every invoice document request

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The new column is the system's record of the plan at generation, written once at insert; nothing the user entered changes. A client value for it is replaced at insert and refused on update, loudly. |
| II. Logic written twice has a parity test | No | The trigger copies a status and decides nothing; "paid" stays `planOf()` alone, in TypeScript. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The gate is in the route handler. `canDownload` on `GET /invoices/:id` is the server's answer; the UI only reflects it. |
| IV. `packages/core` does no I/O | Yes | `documentOpens()` is pure: config flag and two statuses in, boolean out. |
| V. Tests first where a regression is silent | Yes | Route tests for each disposition, each plan, canceled-after-paying, dark billing and 404 before 402; an RLS test that a user can't forge or change the column; core tests for `documentOpens`; a story for the locked header. Invoicing end to end (e2e) runs with billing dark and sees no change, so no e2e is added. |
| VI. Every press answers in the same frame | Yes | Subscribe to download is a link to Settings, a static route; no write. |

Additional constraints: an issued invoice is immutable — the column is
written at insert and refused on update; no new fixed cost; US-only.

## Project Structure

### Documentation (this feature)

```text
specs/007-invoice-gate/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/invoice-document.md
└── tasks.md
```

### Source Code

```text
supabase/migrations/<timestamp>_invoice_issued_plan.sql   # column + trigger
packages/core/src/billing.ts                              # documentOpens()
packages/core/test/billing.test.ts
packages/schema/src/index.ts                              # PAYMENT_REQUIRED
apps/web/src/lib/errors.ts                                # PAYMENT_REQUIRED → 402
apps/web/src/lib/rows.ts                                  # select the column
apps/web/src/app/api/v1/invoices/[id]/pdf/route.ts        # the gate
apps/web/src/app/api/v1/invoices/[id]/route.ts            # canDownload
apps/web/src/lib/client/api.ts                            # type
apps/web/src/components/invoice-detail.tsx (+ .stories.tsx)
apps/web/src/components/plan-section.tsx (+ .stories.tsx)
apps/web/test/routes.test.ts, apps/web/test/rls.test.ts
docs/api.md
```

**Structure Decision**: Existing monorepo layout; no new modules.

## Complexity Tracking

None.
