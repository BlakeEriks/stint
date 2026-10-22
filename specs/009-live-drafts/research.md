# Research: Drafts collect their period's work until sent

## R1. Refresh a stored draft, or derive it on every read

- **Decision**: Keep the draft stored — lines in `invoice_line_items`, entries and expenses attached — and refresh it whenever it is read, in one `refresh_draft()` transaction.
- **Rationale**: Everything downstream already reads stored drafts: the PDF loader, the delete that releases entries, the guards that let draft entries be edited, the rollups that count attached work as invoiced. Refreshing keeps all of them correct with no change. A derived draft would need every one of them to learn a second shape.
- **Alternatives considered**: Derive lines on read and attach nothing until sent — rollups would count draft work as unbilled and the list's outstanding total would double-count it. Refresh on every entry write — a trigger computing lines in SQL, a second implementation of `buildLineItems` (Principle II).
- **Cost**: Between refreshes, an entry logged in a draft's period counts as unbilled on Home. The next read of the draft attaches it.

## R2. What a refresh reads and writes

- **Reads (the user's choices, never written by a refresh)**: `client_id`, `period_start`, `period_end`, `grouping_mode`, `summary_text`, `reference`, `notes`, `payment_terms`, `due_date`, `issue_date`, `payment_details`, the supporting-detail kinds (`attachedSchedules(supporting_detail)`), its `fixed` lines (the charges), new `excluded_expense_ids`, new `tz`.
- **Writes**: releases its entries and one-off expenses; replaces its lines with `buildLineItems` output; attaches the entries and one-off expenses those lines bill; updates `subtotal`, `tax_*`, `expenses_subtotal`, `total`, `supporting_detail` (same kinds, fresh tables).
- **Rate, tax and currency** come from the client and settings now, so a draft shows current rates until sent (spec edge case).
- **Payment details and parties** stay as frozen at generation; they are the user's pick and change only by regenerating.
- **Unrated entries**: a refresh that finds one writes nothing and leaves the draft as last refreshed; Mark sent answers `NO_RATE_CONFIGURED` as generation does.

## R3. Mark sent

- **Decision**: `PATCH /status` to `sent` on a draft calls `refresh_draft(..., p_sent_at)`, which writes the fresh lines and sets `status = 'sent'`, `sent_at` in the same transaction.
- **Rationale**: Nothing logged between a separate refresh and the status flip can be missed or half-attached.

## R4. Changed since download

- **Decision**: `downloaded_snapshot jsonb` on `invoices`: `{ total, hours, lines: [{ description, quantity, amount }] }`, written whenever a draft's PDF is rendered (both dispositions: the in-browser view has a save button). `snapshotChanged(snapshot, current)` in core compares. `GET /invoices/:id` returns `changedSinceDownload: { hours: {from, to}, total: {from, to} } | null` and marks each line `isNew` when it isn't in the snapshot. Mark sent with a changed snapshot answers `409 DRAFT_CHANGED` with the same figures. A draft never rendered has a null snapshot and sends as today.

## R5. One draft per client and date

- **Decision**: `POST /invoices` answers `409 DRAFT_OVERLAPS` with `{ invoiceId, invoiceNumber, periodStart, periodEnd }` when an open draft for the client overlaps the period. New invoice reads the client's drafts from `GET /invoices?clientId&status=draft` and shows the line before Generate.
- **Rationale**: Two overlapping drafts would each claim the same new entries on their next refresh. A route check, not an exclusion constraint: production may already hold overlapping drafts, and a constraint would fail the migration.

## R6. Time zone

- **Decision**: `invoices.tz`, set at generation from the request. Existing drafts get it from the first read that carries `?tz=`; the web sends `tz` on every invoice read. A draft with no `tz` and none in the request isn't refreshed.

## R7. Late entries

- **Decision**: `attention.lateEntries` in `/stats`: unbilled, billable, stopped entries whose project's client has a `sent` or `paid` invoice covering the entry's local date. `lateEntries()` in core does the matching; the route loads sent and paid invoices' periods.
- **Inbox actions**: Not billable (the entry's existing billable toggle) and Open entry.

## R8. Existing drafts

- **Decision**: The migration sets `excluded_expense_ids` on each draft to the client's unbilled one-off expenses dated on or before its period end, not attached to it: they were left off or added later, and a refresh must not add what the user didn't pick. `tz` stays null until the first read (R6).
