# Tasks: Invoice summary with supporting detail

**Input**: `specs/003-invoice-summary-detail/` — plan.md, spec.md, research.md,
data-model.md, contracts/invoices-api.md, design/new-invoice.html

**Tests**: Required. Each story writes its tests first, in the suites
constitution V names: core in `packages/core/test/`, routes in
`apps/web/test/invoices.test.ts` against real Postgres, the mock API in
`apps/web/test/mocks-parity.test.ts`, the screen in
`apps/web/test/ui/*.test.tsx` and one story export per acceptance scenario
in the sibling `*.stories.tsx`.

**PRs**: one per user story, stacked, each on its own branch under 30
characters: US1 `f188-invoice-summary`, US2 `f188-detail`, US3
`f188-preview`, US4 `f188-reference`, US5 `f188-in-form`. Each PR fills Try
it and gets `ready-for-qa` once CI is green.

**Rounding**: [BlakeEriks/stint#199](https://github.com/BlakeEriks/stint/pull/199)
(open, `migration`, takes migration 28) makes a line's quantity the sum of
each entry's hours rounded to 2 dp. Schedules use the same rule, so a
one-rate summary line's quantity equals the schedules' Total. US1's PR opens
once #199 has merged, rebased onto it; only one `migration` PR is open at a
time.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm the worktree runs: `pnpm install`, `pnpm dev:up`, and the dev server started in the background from `/Users/blakeeriks/dev/stint-f188-invoice-summary`

---

## Phase 2: Foundational

None. The migration ships with US1 (research R2); every later story builds on it.

---

## Phase 3: User Story 1 — One summary line and a clean total (P1) 🎯 MVP

**Goal**: "Show time as" offers One summary line, which bills one line per rate carrying Blake's text.

**Independent Test**: Generate a month at one rate with One summary line; the invoice has exactly one time line, whose hours and amount equal the month's billable total.

### Tests first

- [X] T002 [P] [US1] Core tests in `packages/core/test/invoice.test.ts`: `'summary'` with `summaryText` gives one `hour` line per distinct rate, each described by the text; two rates sort cheapest first; entries across projects and tasks at one rate collapse to one line; `entryIds` covers every billed entry; charges and expenses follow as in other modes
- [X] T003 [P] [US1] Route tests in `apps/web/test/invoices.test.ts`: preview with `'summary'` returns one line per rate with `description = summaryText`; `POST /invoices` with `'summary'` and an empty `summaryText` is `422 VALIDATION_FAILED`; a generated summary invoice stores `summary_text` and returns `summaryText`, and `GET /invoices/:id` reads the line exactly as issued; the DB check rejects `summary_text` set on a non-summary invoice
- [X] T004 [P] [US1] Mock parity in `apps/web/test/mocks-parity.test.ts`: the mock `/invoices/preview` and `POST /invoices` agree with the real routes for `'summary'`
- [X] T005 [P] [US1] UI tests in `apps/web/test/ui/invoice-new.test.tsx`: the picker is labeled "Show time as" and lists One summary line first; choosing it shows a required "Summary line" field, empty; empty, it shows "Give the summary line its text." as `role="alert"` with `aria-invalid` on the input, and Generate is disabled; typing text enables it and sends `summaryText`
- [X] T006 [P] [US1] Stories in `apps/web/src/components/invoice-new.stories.tsx`: "One summary line" (scenario 1), "Two rates" (scenario 2), "No summary line" (scenario 3)

### Implementation

- [X] T007 [US1] Migration `supabase/migrations/00000000000029_invoice_summary.sql`: widen the `grouping_mode` check to `('summary','entry','task','project','day')`; add `summary_text text` with `(grouping_mode = 'summary') = (summary_text is not null)` and "`btrim(summary_text) <> ''` and at most 200 characters"; add `reference text` with "`btrim(reference) <> ''` and at most 200 characters"; add `supporting_detail jsonb` with `grouping_mode = 'summary' or supporting_detail is null`; replace `create_invoice(uuid, jsonb, uuid[], uuid[])` from `00000000000025_expenses.sql` to also insert `p_invoice->>'summary_text'`, `nullif(p_invoice->>'reference','')` and `nullif(p_invoice->'supporting_detail','null'::jsonb)`, keeping its grants
- [X] T008 [P] [US1] `packages/core/src/invoice.ts`: `GroupingMode` adds `'summary'`; `buildLineItems` takes `summaryText?: string`, and `describe()` returns it for `'summary'`
- [X] T009 [P] [US1] `packages/schema/src/index.ts`: `GroupingMode` adds `'summary'`; `InvoicePreviewRequest.summaryText` "trimmed, at most 200 characters, default `''`"; `CreateInvoice` refines "`summaryText` is required and non-empty when `groupingMode = 'summary'`"; `Invoice.summaryText: string | null`
- [X] T010 [US1] `apps/web/src/lib/rows.ts` (`INVOICE_COLUMNS`, `InvoiceRow`, `toInvoice`), `apps/web/src/app/api/v1/invoices/preview/route.ts` and `apps/web/src/app/api/v1/invoices/route.ts`: pass `summaryText` to `buildLineItems`, write `summary_text` (null unless `'summary'`)
- [X] T011 [US1] Mock API in `apps/web/src/mocks/handlers.ts` and `apps/web/src/mocks/derive.ts`: `summaryText` through preview and create, `summaryText` on stored invoices
- [X] T012 [US1] `apps/web/src/components/invoice-new.tsx`: "Group lines" becomes "Show time as", One summary line first with its one-line description; with it, a "Summary line" field under the picker, indented on a left rule, empty to start, its error and Generate's disabled state as in T005; `summaryText` on preview and generate
- [X] T013 [US1] `apps/web/src/components/invoice-detail.tsx`: name the grouping "One summary line" wherever the mode is named (none does: the detail screen and PDF print lines, never the mode)
- [X] T014 [US1] `docs/api.md` and `docs/data-model.md`: `'summary'`, `summaryText`, and the three new columns
- [ ] T015 [US1] Run `pnpm verify:static` and `pnpm verify:db`, check New invoice signed in locally, commit, and hold the PR until #199 merges; then rebase, open it with Try it and the `migration` label

**Checkpoint**: US1 is releasable alone.

---

## Phase 4: User Story 2 — Supporting detail from page 2 (P2)

**Goal**: With One summary line, Attach ticks Hours by project, by week and by date; the PDF prints them from page 2, hours only, frozen at generation.

**Independent Test**: Generate with Hours by project and by week ticked; page 2 opens with "Hours by project", and the total equals the same invoice with nothing ticked.

### Tests first

- [X] T016 [P] [US2] `packages/core/test/schedule.test.ts` for `buildSchedules(entries, { tz, periodStart, periodEnd })`: by project, one row per project, "Unassigned" for none, hours descending then name; by week, Monday-start in `tz`, a week the period cuts short spans only its days inside it; by date, one row per local start date and project, a midnight-crossing entry on its start day, chronological then project; each row and `totalHours` follow `buildLineItems`' hours rule, so one rate's line quantity equals `totalHours`; a one-row schedule is still returned; non-billable and unrated entries are excluded
- [X] T017 [P] [US2] Same file, `paginateSchedules(detail, rowsPerPage)`: tables in order project, week, date; a table that crosses a page repeats as `{ kind, continued: true }`; the Total row stays with its table's last rows; nothing is ever on page 1
- [X] T018 [P] [US2] Route tests in `apps/web/test/invoices.test.ts`: preview with `'summary'` returns `schedules` (all three tables and `totalHours`) and `null` otherwise; `POST /invoices` with `schedules` and another mode is `422`; with `schedules: ['week','project']` it stores `supporting_detail` holding only those tables, in print order; after renaming a project and voiding the invoice, `GET /invoices/:id` and the PDF still carry the same detail; the total is unchanged by ticking
- [X] T019 [P] [US2] PDF test beside the existing PDF assertions in `apps/web/test/invoices.test.ts`: a detail invoice gains a page, and one without none (the page breaks and headings are `paginateSchedules`' tests; the rendered pages were checked by eye)
- [X] T020 [P] [US2] UI tests in `apps/web/test/ui/invoice-new.test.tsx` (Attach shows only with One summary line, all unticked, ticks send `schedules`) and `apps/web/test/ui/invoice-detail.test.tsx` (the detail screen names the attached schedules)
- [X] T021 [P] [US2] Stories: "Supporting detail ticked" and "Other grouping, no Attach" in `invoice-new.stories.tsx`; "With supporting detail" in `invoice-detail.stories.tsx`

### Implementation

- [X] T022 [US2] `packages/core/src/schedule.ts` (`buildSchedules`, `paginateSchedules`, the `Schedules` type in `data-model.md`), exported from `packages/core/src/index.ts`; pure, no I/O
- [X] T023 [US2] `packages/schema/src/index.ts`: `Schedules`; `InvoicePreview.schedules: Schedules | null`; `CreateInvoice.schedules` "a unique subset of `project | week | date`, allowed only with `'summary'`", default `[]`; `Invoice.supportingDetail: Schedules | null`
- [X] T024 [US2] Routes: preview returns `buildSchedules` over the entries its lines bill when `'summary'`; `POST /invoices` computes it from the same entries and writes the ticked tables as `supporting_detail`; `rows.ts` reads it
- [X] T025 [US2] `apps/web/src/lib/invoice-pdf.tsx` and `apps/web/src/lib/invoicing.ts` (`loadPdfData`): each page from `paginateSchedules(invoice.supportingDetail)` is its own `<Page>` with the running header; each table has its heading, "(continued)" when it carries over, column headings, one line per row (`maxLines: 1`), hours only, and a Total row; by date prints date, day, project and hours
- [X] T026 [US2] Mock API (`handlers.ts`, `derive.ts`): `schedules` on preview, `supportingDetail` on create and read
- [X] T027 [US2] `invoice-new.tsx`: the Attach band (Hours by project, Hours by week, Hours by date), shown only with One summary line and sent only with it; `invoice-detail.tsx` names the attached schedules
- [X] T028 [US2] `docs/api.md`, `docs/data-model.md`; verify, check the PDF locally, commit, and open the PR stacked on US1

---

## Phase 5: User Story 3 — A live preview beside the form (P3)

**Goal**: New invoice becomes the banded form of `design/new-invoice.html` with a live card beside it that mirrors the PDF.

**Independent Test**: Choose a client and change each field; the card matches the generated PDF's information.

### Tests first

- [X] T029 [P] [US3] UI tests in `apps/web/test/ui/invoice-new.test.tsx`: with a client chosen the card shows the business block, No. (`formatInvoiceNumber`), Issued (today in `tz`), Due ("—" when unset), Bill to, Engagement, lines, totals and payment details; no Preview button; ticking a schedule changes the card with no request; changing the grouping, summary text, an expense tick or a charge shows "Updating…" and disables Generate until the answer lands (fake timers over the 400ms debounce); no client disables Generate; generation sends `issueDate` as today in `tz`; there is no Notes field
- [X] T030 [P] [US3] Stories in `invoice-new.stories.tsx`, Desktop and Phone: "Client chosen", "No client yet", "Updating", each state the Design section names
- [X] T031 [P] [US3] `apps/web/e2e/invoices.spec.ts`: generation end to end without the Preview button

### Implementation

- [X] T032 [US3] `invoice-new.tsx`: the preview as a `useQuery` on the billed inputs, debounced 400ms, `placeholderData: keepPreviousData`; "Updating…" while the debounced key differs from the settled one or a fetch is in flight (research R6); saving an expense invalidates it
- [X] T033 [US3] `invoice-new.tsx`: the card per research R7, from `GET /settings`, `/clients` and `/payment-profiles` through `formatInvoiceNumber`, `resolvePaymentProfile` and `buildPaymentDetails`; caption "Preview · N entries" above it; the dashed "Page 2 · supporting detail" section with the ticked tables; the last line "Generating assigns a number and locks these entries. Voiding later keeps the number on record."
- [X] T034 [US3] `invoice-new.tsx`: the banded form (Client; From, To and Due on one row), labels only, no hints, Notes removed; the sticky title row with Generate; the `@container` layout of research R11 (side by side and sticky at 800px of content, Rate column hidden under 360px); `DetailPage wide`
- [X] T035 [US3] Verify at desktop and phone widths in the browser, signed in locally, against `design/new-invoice.html`; commit; open the PR stacked on US2

---

## Phase 6: User Story 4 — PO / SOW reference (P4)

**Goal**: An optional Reference prints under Service period.

**Independent Test**: Generate with a reference; the header shows it. Without one; no Reference row.

- [ ] T036 [P] [US4] Route tests in `apps/web/test/invoices.test.ts`: `reference` "optional, trimmed, at most 200 characters, and blank becomes null" is stored and returned; the PDF labels "Service period" and prints "Reference" only when set
- [ ] T037 [P] [US4] UI test and story ("With a reference"): the field's placeholder is "PO number, contract or SOW", and typing changes the card's Engagement at once
- [ ] T038 [US4] `CreateInvoice.reference` and `Invoice.reference` in `packages/schema/src/index.ts`; `route.ts` and `rows.ts`; the mock API
- [ ] T039 [US4] `invoice-pdf.tsx`: "Period" becomes "Service period", with "Reference" beneath it when set; `invoice-new.tsx`: the Reference field in the first band and the card's Engagement row; `invoice-detail.tsx` shows it
- [ ] T040 [US4] Docs, verify, commit, open the PR stacked on US3

---

## Phase 7: User Story 5 — Expenses, charges and payment details in the form (P5)

**Goal**: Expenses, charges and payment details are edited without leaving New invoice.

**Independent Test**: Add an expense and a charge and pick a non-default payment profile; the invoice bills both and prints that profile.

### Tests first

- [ ] T041 [P] [US5] Route tests in `apps/web/test/invoices.test.ts`: `paymentProfileId` freezes that profile's block; an archived or unknown id is `422 VALIDATION_FAILED`; absent, the client's profile else the default, as today
- [ ] T042 [P] [US5] UI tests: pressing an expense row's name opens the expense dialog; a new expense appears ticked; "+ Add a charge" saves a charge into the list and the preview key; Remove takes it out; the picker holds the client's profile else the default; "+ New payment details" selects the saved profile (`apps/web/test/ui/invoice-new.test.tsx`, `payment-profiles.test.tsx` for `onSaved`)
- [ ] T043 [P] [US5] Stories: "Editing an expense", "New charge", "New payment details", Desktop and Phone

### Implementation

- [ ] T044 [US5] `apps/web/src/components/expense-row.tsx`: `leading` and `onOpen` together, in the design's form (checkbox, then a button with the name over "↻ Recurring" or the date, the amount and a pencil); the Clients card's rows unchanged
- [ ] T045 [US5] `apps/web/src/components/charge-dialog.tsx`: Description and Amount, both required, Remove on an existing charge; local to the form (research R9); the inline charge rows and the blank row go from `invoice-new.tsx`
- [ ] T046 [US5] `apps/web/src/components/payment-profile-dialog.tsx`: `onSaved(profile)`; the payment-details picker in `invoice-new.tsx` (name, bank and last four, a Default badge, "+ New payment details"), preselected by `resolvePaymentProfile`, feeding the card
- [ ] T047 [US5] `CreateInvoice.paymentProfileId` "an optional uuid"; `route.ts` loads it through `loadPaymentProfile` in `apps/web/src/lib/invoicing.ts`; the mock API
- [ ] T048 [US5] Docs, verify, commit, open the PR stacked on US4

---

## Phase 8: Polish

- [ ] T049 Run `quickstart.md` end to end: reproduce invoice 2026-001 to SystemSphere (SC-001)

---

## Dependencies

- US1 → US2 → US3 → US4 → US5, stacked: each needs the columns and screen of the one before.
- US1's PR waits for #199 to merge (one `migration` PR at a time).
- Within a story, the tests and stories come before the code; `[P]` tasks touch different files.

## Implementation Strategy

US1 is the MVP: page 1 becomes presentable. Each later story is its own PR and is releasable alone.
