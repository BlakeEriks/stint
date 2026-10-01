# Research: Invoice summary with supporting detail

The spec and `design/new-invoice.html` settle what Blake sees. This file
settles how it is stored, computed and drawn.

## R1. One summary line is a fifth grouping mode in `buildLineItems`

**Decision**: `GroupingMode` gains `'summary'`. `buildLineItems` takes a
`summaryText` option, and `describe()` returns it for `'summary'`. The key
stays `description\0rate`, so there is one line per distinct rate (FR-012),
each rounded once from its summed seconds (FR-013). Lines sort by description,
then rate, as every mode but `entry` does, so two rates print cheapest first.

**Rationale**: The rate is always part of the key already. A summary is `task`
grouping with one name for every entry, so nothing about money changes and
preview and invoice still come from the same function.

**Alternatives considered**: Summing the other modes' lines into one after the
fact. That rounds twice and would need a second path for mixed rates.
Rejected.

## R2. One migration, in the first story's PR

**Decision**: `supabase/migrations/00000000000029_invoice_summary.sql` adds
everything the feature stores: `'summary'` in the `grouping_mode` check, and
`summary_text`, `reference` and `supporting_detail` on `invoices`. It
replaces `create_invoice` to write the three columns. It ships with User Story 1
(`data-model.md`).

**Rationale**: The release gate waits for approval and a backup for each
migration, and previews share one schema, so only one `migration` PR can be
open at a time (`docs/sdlc.md`). One migration keeps User Stories 2 to 5 free
of that queue. Every new column is nullable or defaulted, so rows written
before a later story merges stay valid.

**Alternatives considered**: One migration for each story that stores
something (1, 2 and 4). That means three backups, and three PRs that cannot
be open together. Rejected.

## R3. The summary text is stored as well as printed

**Decision**: `invoices.summary_text` holds the text, set exactly when
`grouping_mode = 'summary'`. The line descriptions carry it too, as every
mode's descriptions do.

**Rationale**: The invoice detail screen and #190 (prefill from the client's
last invoice) read the choice from the invoice, not by guessing it back from
a line. A check constraint ties the two columns together, so they cannot
disagree about the mode.

## R4. Schedules are computed at generation and frozen with the invoice

**Decision**: `invoices.supporting_detail jsonb` holds the ticked tables,
computed when the invoice is generated, like `payment_details`. A new pure
function, `buildSchedules(entries, { tz, periodStart, periodEnd })` in
`packages/core/src/schedule.ts`, returns all three tables. `POST /invoices`
keeps the ticked ones and `create_invoice` writes them; the preview calls the
same function on the same entries (FR-023, SC-005). The PDF reads the column
and derives nothing.

- **By project**: one row per project (`Unassigned` for none), hours
  descending, then name.
- **By week**: Monday-start weeks in `tz`, each clipped to the period, so a
  short first or last week prints only its days inside the period.
- **By date**: one row per local start date and project (an entry that crosses
  midnight counts on its start day, as By day does), by date, then project.
- Each row's hours are rounded once from its summed seconds. The Total row is
  rounded once from all the seconds, so it equals a one-rate summary line's
  quantity.

**Rationale**: An issued invoice is immutable. Derived at render, a schedule
would change on a project rename, lose its entries on void (voiding releases
them), and drift while a draft's entries stay editable. Frozen, it is fixed
like the lines, and the zone it was bucketed in never needs storing.

**Alternatives considered**: Storing only the choice and deriving at render.
Rejected for the three drifts above.

## R5. Detail pages are laid out in `packages/core`, not by the renderer

**Decision**: Each schedule row prints on one line (`maxLines: 1`,
ellipsis), so every row has the same height. `paginateSchedules(schedules,
rowsPerPage)` in `schedule.ts` splits the tables into pages. A page records
which table it opens with and whether that table is `continued`. The PDF
draws each page as its own `<Page>`. Each `<Page>` starts with the running
header "Supporting detail · {number} · {client} · {period}", and each table on
it has a heading, "(continued)" when it carries over, and its column headings.

**Rationale**: FR-019 needs schedules to start on page 2 whatever room page 1
has. A separate `<Page>` does that by construction. FR-022's "(continued)"
needs to know where a table breaks, and `@react-pdf/renderer` does not report
that to its children. Deciding the breaks in pure code makes them testable in
`packages/core/test`, where the PDF bytes are not.

**Alternatives considered**: `fixed` headings inside a wrapping `View`. They
repeat, but they cannot say "(continued)" on only the later pages. Rejected.

## R6. The live preview is a query, not a mutation

**Decision**: New invoice reads `POST /invoices/preview` through `useQuery`.
The key is the billed inputs: client, period, grouping, summary text,
charges, excluded expenses and `tz`. The key is debounced by 400ms, and
`placeholderData: keepPreviousData` keeps the last answer on screen. The card
is **Updating…** while the debounced key differs from the settled key or a
fetch is in flight. That dims the figures and disables Generate (FR-016).
Saving an expense in the dialog invalidates the preview.

**Rationale**: The preview writes nothing, so Principle VI's single write path
does not apply. A query keyed on its inputs throws away an answer that no
longer matches, and it refetches after a save. The Preview button's
`useOptimisticMutation` could do neither.

## R7. The card's other blocks come from queries the client already holds

**Decision**: The preview response gains only `schedules`. The rest of the
card is built from reads New invoice already has, through the same core
functions the server uses:

| Block | Source |
| --- | --- |
| Business block, next number, payment terms | `GET /settings`; `formatInvoiceNumber(prefix, nextInvoiceNumber)` |
| Bill to | `GET /clients` (name, email, address) |
| Issued | today, `localDateKey(now, tz)` |
| Payment details | `GET /payment-profiles`; `resolvePaymentProfile`, then `buildPaymentDetails(profile, { invoiceNumber })` |
| Reference, Attach | the form's own state |

**Rationale**: FR-016 lists the grouping, summary text, expenses and charges
as what the server computes. The reference, the ticks and the payment pick
must show in the same frame, so the card cannot wait on a request for them.
The number is a prediction: generation allocates it (Principle III), and the
card's last line says so.

**Consequence**: The card shows the local date under Issued, so generation
sends `issueDate: localDateKey(now, tz)`. The route's fallback today is the
UTC date, which is a day ahead on a US evening.

## R8. The chosen payment profile reaches `create_invoice` as its snapshot

**Decision**: `CreateInvoice` gains `paymentProfileId` (optional). When it is
set, the route loads that profile, and returns `422 VALIDATION_FAILED` if the
profile is archived or not found. When it is unset, the route resolves the
profile as it does today. Either way `buildPaymentDetails(profile)` goes into
`payment_details`, which is already the frozen snapshot (FR-008).
`create_invoice` does not change for this. The picker is preselected with
`resolvePaymentProfile` (FR-007), the same function the route uses.

**Rationale**: The invoice already freezes the rendered block rather than a
reference, and a later edit to the profile must not reach it. Storing a
profile id beside the snapshot would be a second fact to keep true.

## R9. Charges are local until generation

**Decision**: A new `charge-dialog.tsx` edits a draft charge (Description and
Amount, both required; Remove when editing an existing one) in the form's
state. Save and Remove close the dialog at once and change the preview key.
The inline rows, the blank row and `billableCharges`' tolerance for half-typed
rows all go (FR-006).

**Rationale**: A charge is stored only as a line of the invoice that is
generated, so the dialog has no server write to wait on.

## R10. Shared parts change as little as they can

- **`ExpenseRow`** accepts `leading` and `onOpen` together. Only New invoice
  passes `leading`, so that branch takes the design's form: the checkbox, then
  a button holding the name over "↻ Recurring" or the date, the amount and a
  pencil. The checkbox bills the expense and the button opens the dialog
  (FR-005). The Clients card's rows are unchanged.
- **`ExpenseDialog`** is reused unchanged. On a new expense, `onSaved` removes
  its id from `excludedExpenseIds`, so it is ticked.
- **`PaymentProfileDialog`** gains `onSaved(profile)`, which the picker uses to
  select the saved profile (FR-007). Settings ignores it.
- **`Field`** loses nothing. New invoice passes no `hint`, and the Summary
  line's error renders as its own `role="alert"` line under the input, which
  is also marked `aria-invalid`.

## R11. Layout follows the panel, not the viewport

**Decision**: The screen root is an `@container`. At 800px of content (an
840px panel) the form column is 360px and the card column, up to 816px, is
sticky beside it, the pair centered.
Below that the card follows the form. The card is its own `@container`, and
below `@[360px]` the Rate column is hidden (FR-017). The title row ("New
invoice", Generate) is `sticky top-0` in the panel (FR-011). The screen uses
`DetailPage workspace`: `data-workspace` on its `<main>` makes `AppShell`
drop the dock's column through CSS `:has()`, so the frame never checks a
route. On a 16" laptop (1728px) that takes the preview from 426px to 760px.
Growing the card past its 1440 × 900 as well added only 56px, and resized the
frame between screens. A dock that folds instead is #207.

**Rationale**: The dock and the sidebar change the panel's width without
changing the viewport's, which is why `home-cards.tsx` already sizes off its
panel.

## R12. Due keeps today's behavior

**Decision**: Due is empty to start, as it is today, and moves to the first
band. The card and the PDF print "—" until Due is set. The design shows a
date there because its mock is filled in.

**Alternatives considered**: Prefilling Due from "Net N" payment terms. That
would parse free text the spec does not ask about, so it is left for an issue
of its own.
