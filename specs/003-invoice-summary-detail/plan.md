# Implementation Plan: Invoice summary with supporting detail

**Branch**: `f188-invoice-summary` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`specs/003-invoice-summary-detail/spec.md`, and its design,
[`design/new-invoice.html`](design/new-invoice.html)

## Summary

New invoice gains a fifth way to show time, **One summary line**. It gives one
line per rate, carrying Blake's own text, so the total sits right under the
work. With a summary, he can attach **supporting detail**: hours by project,
by week and by date, from page 2 of the PDF. The tables are computed from the
billed entries at generation, by the same pure function the preview uses, and
frozen with the invoice. The form becomes one
banded list with a **live preview** beside it, a **Reference** for the PO or
SOW, and dialogs for expenses and charges. It also gets a payment-details
picker whose choice the invoice freezes. One migration widens `invoices`.
Each user story is its own PR, in the spec's order.

## Technical Context

**Language/Version**: TypeScript 6 (Next.js App Router, Node 24) and SQL
(Postgres, Supabase)

**Primary Dependencies**: Next.js Route Handlers, Supabase JS, Zod
(`@stint/schema`), `@react-pdf/renderer` (`invoice-pdf.tsx`), TanStack Query
(`useQuery` for the preview, `useOptimisticMutation` for every write), Radix
dialogs and menus, Storybook on the in-memory `/api/v1`
(`apps/web/src/mocks/`)

**Storage**: Postgres. Three columns on `invoices`, one widened check, and
`create_invoice` replaced (`data-model.md`)

**Testing**: `packages/core/test` (`invoice.test.ts`, new `schedule.test.ts`);
`node --test` against real Postgres (`invoices.test.ts`,
`mocks-parity.test.ts`); Vitest UI tests (`invoice-new.test.tsx`,
`invoice-detail.test.tsx`); one story per acceptance scenario and design
state; `e2e/invoices.spec.ts` for generation end to end

**Target Platform**: The web app. The macOS app does not create or read
invoices' line items.

**Project Type**: Web application (monorepo: `apps/web`, `packages/core`,
`packages/schema`, `supabase/`)

**Performance Goals**: One preview request 400ms after the last change. By
date runs to about 60 rows a month.

**Constraints**: One open `migration` PR at a time (`docs/sdlc.md`). Every
new column is nullable or defaulted, so invoices already issued are
untouched.

**Scale/Scope**: One migration. Two routes widened (`preview`, `POST
/invoices`) and one loader (`loadPdfData`). One new core module
(`schedule.ts`) and one new component (`charge-dialog.tsx`). Changes to New
invoice, the invoice detail screen, the PDF, `ExpenseRow` and
`PaymentProfileDialog`.

No NEEDS CLARIFICATION remain. `research.md` settles each decision.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Nothing is corrected for Blake. An empty summary line blocks Generate with its reason at the field. An unrated entry blocks as in every mode. |
| II. Logic written twice has a parity test | Yes, no SQL twin | Lines and schedules are computed only in `@stint/core` and called by the preview, `POST /invoices` and the mock `/api/v1`. `mocks-parity.test.ts` extends to `schedules`. |
| III. Every client through `/api/v1`; server owns truth | Yes | The preview and generation are route handlers. No Server Actions. The card's number is a prediction that generation replaces (R7). |
| IV. `packages/core` does no I/O | Yes | `buildSchedules` and `paginateSchedules` take entries, the zone and the period as arguments. The routes read, core transforms. |
| V. Tests first, one suite per kind | Yes | Core first in `packages/core/test`. Route rules in `invoices.test.ts`. No new table, so `rls.test.ts` is unchanged, and `own_invoices` covers the columns. One story per acceptance scenario and design state. Generation in `e2e/invoices.spec.ts`. |
| VI. Every press answers in the same frame | Yes | Reference, Attach, the payment pick and a charge's Save or Remove show at once. A change the server computes shows **Updating…** at once (R6). Generate and the expense and payment dialogs show pending through `useOptimisticMutation`, as today. |
| Additional Constraints | Yes | Issued invoices stay immutable, and the new columns are written once by `create_invoice`. Money is still `numeric(12,2)`. No new fixed cost. US and USD defaults. |

**Result**: Passes, before and after design. Schedules are frozen at
generation, so an issued invoice never changes (R4).

## PRs, one per user story

`docs/sdlc.md`: a feature merges one user story at a time. Each PR is
releasable alone, with its tests and stories.

| # | Story | What it ships | Label |
| --- | --- | --- | --- |
| 1 | US1 One summary line | Migration 29 (R2). `GroupingMode` `'summary'` and `summaryText` in schema, core and routes. "Group lines" becomes "Show time as", One summary line first, and the Summary line field and its error. Generate disabled on an empty line. `summary_text` stored. Mocks. | `migration` |
| 2 | US2 Supporting detail | `schedule.ts` (`buildSchedules`, `paginateSchedules`). Attach ticks, only with a summary. `POST /invoices` freezes the ticked tables in `supporting_detail`, and the PDF draws detail pages from it. The detail screen names them. | |
| 3 | US3 Live preview | The preview as a debounced `useQuery` (R6), with `schedules` in its response. The card mirrors the PDF (R7): business block, number, Issued, Due, Bill to, Engagement, lines, totals, payment block, and page 2 detail. The title row is sticky. The form becomes bands, the Preview button and Notes go, and the layout follows the panel (R11). `issueDate` is sent in `tz`. UI and e2e tests move off the Preview button. | |
| 4 | US4 Reference | A Reference field, stored in `reference`. The PDF labels "Service period" and adds "Reference" beneath it. The card's Engagement row. | |
| 5 | US5 Expenses, charges, payment | `ExpenseRow` opens the dialog from New invoice, and a new expense is ticked. `charge-dialog.tsx` (R9). The payment-details picker, `PaymentProfileDialog.onSaved`, and `paymentProfileId` on `POST /invoices` (R8). | |

## Project Structure

### Documentation (this feature)

```text
specs/003-invoice-summary-detail/
├── spec.md
├── design/new-invoice.html
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/invoices-api.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
supabase/migrations/00000000000029_invoice_summary.sql  # new (PR 1): columns, checks, create_invoice
packages/schema/src/index.ts                  # GroupingMode, summaryText, schedules, reference, paymentProfileId, Invoice fields
packages/core/src/invoice.ts                  # 'summary' mode, summaryText (PR 1)
packages/core/src/schedule.ts                 # new (PR 2): buildSchedules, paginateSchedules
packages/core/test/invoice.test.ts, schedule.test.ts
apps/web/src/lib/rows.ts                      # INVOICE_COLUMNS, toInvoice
apps/web/src/lib/invoicing.ts                 # loadPaymentProfile by id
apps/web/src/lib/invoice-pdf.tsx              # Service period, Reference, detail pages
apps/web/src/app/api/v1/invoices/route.ts, preview/route.ts
apps/web/src/lib/client/api.ts                # request and response types
apps/web/src/mocks/{fixtures,derive,handlers}.ts
apps/web/src/components/invoice-new.tsx       # the form, the card, the layout
apps/web/src/components/charge-dialog.tsx     # new (PR 5)
apps/web/src/components/expense-row.tsx       # leading + onOpen (PR 5)
apps/web/src/components/payment-profile-dialog.tsx  # onSaved (PR 5)
apps/web/src/components/invoice-detail.tsx    # names the schedules (PR 2)
apps/web/src/components/invoice-new.stories.tsx, invoice-detail.stories.tsx
apps/web/test/invoices.test.ts, mocks-parity.test.ts, ui/invoice-new.test.tsx, ui/invoice-detail.test.tsx
apps/web/e2e/invoices.spec.ts                 # PR 3
docs/api.md, docs/data-model.md               # each PR, for what it changes
```

**Structure Decision**: The existing monorepo layout. Schedules are a core
module of their own, beside `invoice.ts`. They bucket entries and never price
them, so they stay out of `buildLineItems`.

## Complexity Tracking

None. No principle is broken.
