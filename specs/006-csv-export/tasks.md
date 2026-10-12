# Tasks: Export your records

**Input**: `specs/006-csv-export/` (spec, plan, research, data-model, contracts)

**Tests**: Required by Constitution V: money, routes and client logic are
tested first, and each visible state has a story.

## Phase 1: Setup

- [ ] T001 Build a private test database with `scripts/ci-db.sh` and point `DATABASE_URL` at it for this worktree's runs (memory: other sessions rebuild the shared one)

## Phase 2: Foundational

- [ ] T002 Export `billedAmount(seconds, rate)` from `packages/core/src/invoice.ts`, built on the existing `hundredths` and `priced`, and use it where `buildLineItems` prices a single entry's hundredths if that keeps one path
- [ ] T003 Write failing tests for `toCsv()` in `packages/core/test/export.test.ts`: BOM first, CRLF, quoting of comma, quote, CR and LF, `'` before a text cell starting `=`, `+`, `-`, `@`, tab or CR, numbers as two-place decimals never prefixed, null as an empty cell
- [ ] T004 Implement `toCsv(header, rows)` in `packages/core/src/export.ts` and export it from `packages/core/src/index.ts`
- [ ] T005 [P] Add `ExportQuery = z.object({ tz: timeZone })` to `packages/schema/src/index.ts`
- [ ] T006 Add `csvResponse(kind, tz, body)` in `apps/web/src/lib/exports.ts`: `text/csv; charset=utf-8`, `attachment; filename="stint-<kind>-<YYYY-MM-DD in tz>.csv"`, `private, no-store`

## Phase 3: User Story 1 - Hand the accountant every invoice (P1)

**Independent test**: with draft, sent, paid and void invoices, the invoices file has one row per invoice, newest first, with totals matching each invoice.

- [ ] T007 [US1] Write failing tests for `invoicesCsv(data, tz)` in `packages/core/test/export.test.ts`: header `Invoice, Client, Status, Issue date, Due date, Sent date, Paid date, Period start, Period end, Subtotal, Tax rate, Tax, Expenses, Total, Currency`; every status as `Draft`/`Sent`/`Paid`/`Void`; newest issue date first then highest sequence; `MM/DD/YYYY` dates; `paid_at` as its local date in `tz` (an evening payment west of UTC stays on its day); empty cells for unset dates; header only with no invoices
- [ ] T008 [US1] Implement `invoicesCsv` in `packages/core/src/export.ts`
- [ ] T009 [US1] Write failing route tests in `apps/web/test/routes.test.ts` for `GET /api/v1/exports/invoices`: 200 with CSV headers and filename, every status present, client name by id including an archived client, and another user's invoice absent
- [ ] T010 [US1] Implement `apps/web/src/app/api/v1/exports/invoices/route.ts`: read invoices (`INVOICE_COLUMNS`, `selectAll`) and clients, hand them to `invoicesCsv`, answer with `csvResponse`

## Phase 4: User Story 2 - Take every entry, with its rate (P1)

**Independent test**: with entries at every rate level, a `0` rate and no rate, the entries file carries each entry's hours, rate, source and amount as an invoice would bill them.

- [ ] T011 [US2] Write failing tests for `entriesCsv(data, tz)` in `packages/core/test/export.test.ts`: header `Date, Start, End, Hours, Client, Project, Task, Billable, Rate, Rate source, Amount, Currency, Invoice`; running entries left out; oldest first; rate precedence entry > project > client > default; `0` exports `0.00` rate and `0.00` amount; no rate exports empty rate and amount with source `none`; non-billable has empty amount; 20 minutes at 100 is `0.33` hours and `33.00`; invoice number, `Invoiced elsewhere`, or empty; no project means empty client and project; client currency over the user's; local date and `9:05 AM` times in `tz`
- [ ] T012 [US2] Implement `entriesCsv` in `packages/core/src/export.ts` with `resolveRate`, `resolveRateSource` and `billedAmount`
- [ ] T013 [US2] Write failing route tests in `apps/web/test/routes.test.ts` for `GET /api/v1/exports/entries`: a `0` project rate exports `0.00`, an invoiced entry names its invoice, past the 1,000-row page every entry is present, a running entry is absent, another user's entry is absent
- [ ] T014 [US2] Implement `apps/web/src/app/api/v1/exports/entries/route.ts`: read finished entries (with `invoiced_elsewhere`), projects, clients, invoice numbers and the user's default rate and currency with `selectAll`, hand them to `entriesCsv`, answer with `csvResponse`

## Phase 5: User Story 3 - Find export where import is (P2)

**Independent test**: Settings shows an Export section with both downloads; a press shows pending, saves the file, and a failure says so.

- [ ] T015 [US3] Add `exportCsv(kind, tz)` to `apps/web/src/lib/client/api.ts`, returning the blob and the filename from `Content-Disposition`, and throwing `ApiError` on a non-2xx
- [ ] T016 [US3] Write failing tests for `useDownload` in `apps/web/test/ui/use-download.test.tsx`: pending while the fetch runs, the file saved under the server's filename, a failure sets `failed` and clears pending, a second press clears the failure
- [ ] T017 [US3] Implement `useDownload` in `apps/web/src/lib/client/use-download.ts`
- [ ] T018 [P] [US3] Add `exportEntries` and `exportInvoices` handlers to `apps/web/src/mocks/handlers.ts`, building the file with `entriesCsv`/`invoicesCsv` from the mock account
- [ ] T019 [US3] Build `ExportSection` in `apps/web/src/components/export-section.tsx` (title "Export", description, "Download entries" and "Download invoices" with the `Download` icon, `Loader2` and "Preparing" while pending, an inline failure line) and mount it after Import in `apps/web/src/components/settings-page.tsx`
- [ ] T020 [US3] Add stories to `apps/web/src/components/settings-page.stories.tsx`: the Export section's two buttons in Desktop, `ExportDownloading` (`stalled('exportEntries')`), `ExportFailed` (`failing('exportInvoices')`)

## Phase 6: Polish

- [ ] T021 Run `pnpm lint`, `pnpm typecheck`, core tests, web route tests, `test:ui`, `test:stories`
- [ ] T022 Sign in to local dev as the seeded account and download both files from Settings
- [ ] T023 Mention exports where `docs/` lists the API or Settings, if any doc owns it (`/doc-drift` on the branch)

## Dependencies

Phase 2 blocks everything. US1 and US2 are independent of each other once
`toCsv` exists. US3 needs both routes for its real use, and the mock
handlers need both core functions.

## Parallel opportunities

T005 beside T003/T004. US1 and US2 core work can proceed in parallel. T018
beside T016/T017.

## Implementation strategy

MVP is US1 (the accountant's file), then US2, then the Settings section that
exposes both; the branch ships all three together, since a route without a
button can't be found.
