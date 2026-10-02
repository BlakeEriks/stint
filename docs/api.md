# API Contract — `/api/v1/*`

Every client (web and the macOS app) uses these endpoints, and an endpoint
not built yet is marked `(not implemented)`. Auth is a Supabase JWT as
`Authorization: Bearer <token>`. Request/response shapes are defined in
`packages/schema/src/index.ts` — that file is the source of truth, and every
route parses its request against it; this document is the map.

Handlers are covered by integration tests that run the real route code against
a real Postgres instance with the real migrations applied
(`apps/web/test/routes.test.ts`, `apps/web/test/invoices.test.ts`) — so the
timer index and immutability triggers are genuinely exercised rather than
mocked. Those tests disable RLS; **`apps/web/test/rls.test.ts` covers RLS
separately**, connecting as a non-superuser role with the policies live.

Every handler is covered — 45 of 45, counting handlers rather than files.

## Timer

The timer is **server-authoritative**. These are the only endpoints whose
behavior depends on global state.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/timer/start` | `{ id?, projectId?, taskName?, startedAt?, isBillable? }` — `taskName` defaults to `''`, since a timer started in a hurry can be named later. Returns `201`. **`409 TIMER_ALREADY_RUNNING`** if one is running, with the running entry in `details.running` so the client can display it rather than just reporting a conflict. `startedAt` allows backdating a forgotten start. **`isBillable` omitted leaves the column's `true` default**; it is sent only when starting from a past entry, which carries that entry's own answer so resumed internal work does not come back billable. |
| `POST` | `/timer/stop` | `{ endedAt? }`, defaults to server `now()`. Returns `{ entry, currency, unbilled }`, `unbilled` being `/stats`'s, counted after the stop, so a client shows the new total without a second request. `409 NO_TIMER_RUNNING` if none; `422 VALIDATION_FAILED` if a backdated `endedAt` is at or before `startedAt`. |
| `GET` | `/timer/current` | `{ entry, serverTime }`. |
| `PATCH` | `/timer/current` | Edit task name / project mid-run. `409 NO_TIMER_RUNNING` if none; `409 ENTRY_LOCKED` if billed. |

`serverTime` is returned so clients can correct for clock skew rather than
trusting the device clock.

## Entries

| Method | Path | Notes |
|---|---|---|
| `GET` | `/entries` | `?from&to&projectId&clientId&limit` (1–500, default 200), newest first. **`projectId=none`** returns entries with no project at all — an absent parameter already means "every entry", so there was otherwise no way to ask for the ones the inbox surfaces. |
| `GET` | `/entries/:id` | |
| `POST` | `/entries` | Manual entry. `id` is client-supplied (UUIDv7) so a retry is idempotent. Always complete — `endedAt` required, and `422 VALIDATION_FAILED` if it is at or before `startedAt`. |
| `PATCH` | `/entries/:id` | **`409 ENTRY_LOCKED`** if billed on a non-draft invoice. Returns `409 TIMER_ALREADY_RUNNING` if clearing `endedAt` would reopen this entry while another timer runs, and `422 VALIDATION_FAILED` if the patch would leave `endedAt` at or before `startedAt`. |
| `DELETE` | `/entries/:id` | Same lock applies. |

## Import

A Toggl Track detailed-report CSV, as `multipart/form-data`: `file`, and
`timeZone` (IANA) — the zone the export's wall-clock times are in, which is
the exporting account's and not necessarily the caller's. Optional: `allBillable=true` imports every row billable (Toggl's
free plan marks all of them not billable); `clients`, JSON keyed by the
client's name as matched (trimmed, lower case) —
`{ invoicedThrough?, hourlyRate?, color? }`, where `invoicedThrough`
(`YYYY-MM-DD`) marks that client's rows starting on or before it as invoiced
elsewhere, and `hourlyRate` and `color` apply only to a client the import
creates; and `excluded`, a JSON list of source row ids left out of the
import, honored only for a row listed as overlapping.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/imports/preview` | Every row the file would write and why any would not, the clients its work lands in, and every overlap past the grace period, longest first. Writes nothing. |
| `POST` | `/imports/confirm` | Writes what the same file previews as, re-deriving it server-side rather than trusting a preview sent back. Returns `{ written, alreadyImported, unrated, overlapping, excluded, invoicedElsewhere }`. |

Each entry's id is derived from the user and the row's own content, so a
retry or the same file twice lands on rows already written and adds nothing.
Imported entries carry no `rateOverride`: they resolve through the rate chain
like any other. A row with no end time is never written. Both return **`422
IMPORT_FILE_UNRECOGNIZED`** for a file that is not a Toggl export,
or one with an unreadable row, before anything is written.

## Views

| Method | Path | Notes |
|---|---|---|
| `GET` | `/summary` | **The menu bar endpoint.** Returns `{ running, todaySeconds, weekSeconds, serverTime }` in one call, so the Mac app can toggle between "current timer" and "today's total" without a second request. |
| `GET` | `/calendar` | `?from&to` (**both required**) `&tz&granularity`. Returns `{ days: [...] }`. `400 INVALID_PERIOD` if `to < from`. |
| `GET` | `/calendar?granularity=day` | Day totals only — `{ date, totalSeconds, byClient }` per day, no entries. A month of full entries is a heavy payload for something drawing one column per day. **Seconds only**, so it carries no money; Home's week bars take both columns from `/stats`'s `week` instead. `byClient` keys by client id with `''` for internal work, and running entries are excluded. |
| `GET` | `/stats` | `?tz` — the home screen cards **and the dock's inbox** in one call. One request because they render together, and a set that pops in piecemeal reads as broken. Fields and their rules are below. |
| `GET` | `/entries/task-names` | `?projectId&limit` (1–20, default 8). Returns `{ taskNames: [{ taskName, projectId, lastUsedAt }] }` — names the user has typed before, for suggesting one rather than retyping it. One row per name **case-insensitively**, keeping the most recent spelling, since offering both is offering the user their own typo; the empty name is excluded, so a timer started in a hurry never becomes a suggestion. **`projectId` ranks, it does not filter** — names used with that project come first and every other name still follows, so there is no `none` literal as there is on `/entries`: "no project" and "no preference" are one request. Omitting it ranks by recency alone. Ranking is the server's and clients must not re-sort it; filtering as the user types is theirs. Backed by the `recent_task_names` SQL function. |

### `/stats` fields

`currency`, `unbilled`, `earnedToday`, `week`, `month`, `collected`,
`awaitingPayment`, `openInvoiceCount` and `attention`. The rollups behind
them, and the window each one runs, are in `docs/data-model.md`; what the
screen does with them is `Screens/Home` in Storybook.

**Three figures are three stages of one pipeline, and no two may be summed** —
any pair double-counts the same hours. `unbilled` is work done and not
invoiced — here or, for an entry marked `invoiced_elsewhere`, anywhere — `awaitingPayment` is invoiced and not collected, `collected` is
money that arrived. `openInvoiceCount` is how many invoices make up the
second.

**Only invoices in the response's `currency` count**, since the screen prints
one currency beside the figure and a euro added in would be reported as a
dollar. `collected.daysSincePaid` is whole calendar days in `tz` from the
latest `paid_at` in that same currency, and **null** when nothing in it has
ever been paid or that `paid_at` is in the future.

**`earnedToday` is work done today at its resolved rate**, bucketed by the
entry's own date in `tz` — a property of the data, so it reads the same on
every device. Unrated work earns nothing it can name, so it can understate a
day whose rate chain resolves to null.

**Rows are capped and the remainder is reported, never dropped.** `unbilled`
carries 5 rows plus a `moreClients` count. The total still covers every
client.

**`month` is the screen's subject and needs no target.** `month.earned` is
the month so far; `month.projected` carries its trailing rate to the last
business day, and is **null until three business days have elapsed** —
earned-so-far over one elapsed day multiplied by the month is a figure that
swings by thousands on the second day, so it is withheld rather than guessed
at. `monthlyTarget` is a setting this field does not read.

`month.series` steps on business days **only** and carries one point per
business day of the month: the cumulative `actual`, **null past today**,
because a line held level to the 31st reads as a month that stopped working.
Weekend work is carried onto the next business day's point, so the last
non-null `actual` always equals `month.earned` — the hero figure is the
line's own last point, never a separate sum, since the projection
extrapolates that series. `month.projection` is the dashed leg from today to
month end, `{ from, to }`, and null whenever `projected` is.

Earned counts work **done**, bucketed by the entry's date and never the
invoice's `issue_date`; voiding an invoice releases its entries.

**`month.byClient` is the month's money per client** — the strip beneath the
climb, `{ clientId, clientName, amount }` ordered by amount descending, with
`clientId` null for internal work. It is **money, where the week's bars are
seconds**: the month's subject is Earned, so its split divides what was
earned. `amount` sums invoiced and unbilled, because the split is by client
and not by billing state — a client's band must not shrink the day its
invoice goes out. A client whose month resolved no rate is absent, having
earned nothing to give a band a width. One `revenue_by_client` call over the
month, never `resolve_entry_rate` per client.

**`week` is seven days, oldest first, from the user's own `weekStartsOn`** —
always seven, so a day with no work is a zero column rather than an absent
one. Each carries `seconds` and `amount`, and **the two do not share a
filter**: `seconds` counts all billable worked time including work whose rate
chain resolves to null, because that time was worked and it sets the bar's
height; `amount` excludes it and is **null** on a day that resolves no rate,
so the bar prints no figure rather than `$0`. A rate of exactly `0` is a real
rate — it counts in `seconds` and contributes `0.00`. The week runs its own
window over `revenue_by_day`, since a week straddles the 1st and the month's
rows stop at the boundary.

**`attention` is derived per request** from stored facts, with grace periods:
an invoice is overdue at `due_date` + 7 days, a draft stale 7 days after
issue. The one row whose condition never clears on its own is gated by a
stored answer instead — `duration_ok` on an entry of unusual length — so it
cannot return every day once answered. `unprojected` is one row per entry,
oldest first; `strangeDurations` one per stopped entry of implausible length.
The long threshold defaults to 12 hours, which is how a timer left running
overnight reaches the inbox; the short one defaults to null. `overlaps` is one
per pair of uninvoiced entries sharing a minute or more (`MIN_OVERLAP_SECONDS`
in `@stint/core`), naming the later-starting entry; it clears when either is
edited apart.

## Clients / projects / settings

Standard CRUD: `GET|POST /clients`, `GET|PATCH|DELETE /clients/:id`, same for
`/projects` and `/payment-profiles`. `GET|PATCH /settings`.

`GET /account` counts what deleting it would remove — `{ entries, clients,
projects, invoices }`, archived rows included. `DELETE /account` removes the
caller and every row they own in one transaction, issued invoices included,
and returns `204`; a failure removes nothing. The caller's token still
verifies until it expires, so a client signs out locally after the `204`.

`POST` on all three accepts an optional client-supplied `id` (UUIDv7); a
duplicate-key insert returns the existing row with `200` rather than an error,
so a retried request is idempotent. A fresh create returns `201`.

**`clientId` on a project is optional and nullable**, so a body carrying only
a name creates internal work — which is how unbillable time is modeled, and
the one shape a caller is most likely to send.

Deletion is **archival** (`archivedAt`), never destructive — historical
invoices reference these rows. `DELETE` returns `204`.

**Filters, all optional:**

| Param | On | Effect |
|---|---|---|
| `includeArchived=true` | clients, projects, payment-profiles | Return archived rows too. Without it they are hidden. |
| `withScale=true` | clients | Adds `projectCount` and `unbilledAmount` per client. |
| `clientId=` | projects | Only that client's projects. |

**`archived` is a PATCH field, and it is the only way back.** `archived: true`
sets `archivedAt`; `archived: false` clears it. Un-archiving exists and has no
other route.

`isDefault` on a payment profile is likewise set through `POST`/`PATCH` — the
first profile a user creates becomes the default automatically, and the
database enforces one per user. On `PATCH` it is **optional with no default**,
so editing any other field leaves the current default alone; a create without
it means `false`.

**A user with any live profile always has a default.** `isDefault: false` on
the last one is answered with the unchanged profile, and archiving the default
promotes the next profile by name.

`nextInvoiceNumber` is not settable through `PATCH /settings`: gapless
numbering depends on `allocate_invoice_number()` holding the row lock. Every
other field of `Settings` is, including the `minEntrySeconds` /
`maxEntryHours` thresholds that drive the inbox's strange-duration row, and
`monthlyTarget` / `monthlyTargetUnit`, which must be set or cleared together.
`monthlyTarget` is **positive or null** — `0` is a `422`, since a zero target
is a cleared one said a second way. The pairing's Zod `422` fires only when
**both** keys are in the same patch; a single-field patch that breaks it
reaches the database constraint, which is mapped to the same `422`.

A client carries `paymentProfileId` on `POST` and `PATCH` — every field of
`Client` is writable except `id` and `archivedAt`.

**Money is cents.** Every rate and amount is validated as a non-negative
multiple of `0.01`, so `10.005` is a `422` rather than a silently rounded
rate. `0` is a real rate, distinct from `null`, which means "fall back".

## Invoicing

| Method | Path | Notes |
|---|---|---|
| `GET` | `/invoices` | `?clientId&status&limit` (1–200, default 50), newest first — ordered by invoice sequence, not issue date. |
| `POST` | `/invoices/preview` | **No side effects.** `{ clientId, periodStart, periodEnd, groupingMode?, summaryText?, tz?, manualLines?, excludedExpenseIds? }` → `lineItems`, `subtotal`, `taxRate`, `taxAmount`, `expensesSubtotal`, `total`, `entryCount`, `unratedEntryIds`, `schedules` (every supporting-detail table with `summary`, else null), plus `clientId`, `clientName`, `currency`, the echoed period and `groupingMode`. `400 INVALID_PERIOD` if `periodEnd < periodStart`; `422 VALIDATION_FAILED` if `tz` is not an IANA zone. |
| `POST` | `/invoices` | Allocates the number, freezes line items **and payment details**, locks entries and expenses, in one transaction. Also accepts `issueDate`, `dueDate`, `notes`, `paymentTerms`, `tz`, `reference` (the PO, contract or SOW, at most 200 characters; blank is none), and `schedules` (`project | week | date`, with `summary` only), which freezes those tables as `supportingDetail`. `paymentProfileId` picks the payment details to freeze; absent, the client's profile, else the default. Returns the `Invoice` plus `lineItems` and `entryCount`. `400 NO_RATE_CONFIGURED` if any entry has no resolvable rate; `400 INVALID_PERIOD` if there is nothing to bill: no time, no expense and no charge; `422 VALIDATION_FAILED` for `summary` with an empty `summaryText`, `schedules` with another grouping, or a `paymentProfileId` archived or not found; `409 EXPENSE_ALREADY_INVOICED` if another invoice took one of its expenses first, or `409 ENTRY_ALREADY_INVOICED` if one of its entries was billed elsewhere or deleted since it was loaded; either writes nothing and uses no number; `422 VALIDATION_FAILED` on an invalid `tz`. |
| `GET` | `/invoices/:id` | Invoice + frozen line items + the client's `{ id, name, email, address }` (not the full client row). Returned **flat**, like every other detail route. These `lineItems` carry `id` and `sortOrder`; the ones a preview or a generation returns carry `rateSource` and `entryIds` instead. |
| `DELETE` | `/invoices/:id` | **Drafts only** — `422 VALIDATION_FAILED` otherwise. An issued invoice must be voided, so numbering stays gapless. Releases its entries and expenses. |
| `GET` | `/invoices/:id/pdf` | Streams `application/pdf` from the frozen line items, then the frozen `supportingDetail` from page 2, in hours. `?download=1` for `attachment` rather than an inline preview. |
| `PATCH` | `/invoices/:id/status` | `{ status, sentAt?, paidAt? }`. Also how an invoice is marked sent. `422 VALIDATION_FAILED` on a transition the table below forbids, or if `paidAt` is later than now or earlier than the invoice's `sentAt`. |

**Status transitions are constrained:** draft→sent/void, sent→paid/void,
paid→void. `void` is terminal, and setting a status to its current value is a
no-op rather than an error.
Nothing returns to draft — leaving `draft` is what locked the entries, and
reopening would let billed time change after the client saw it. Voiding
releases the entries and expenses for re-billing while the number stays on
record.

**Excluded from billing:** running timers (you cannot bill time still
accruing), non-billable entries, and entries already attached to an invoice.

**Expenses are billed from what is stored, never from the request.** An
invoice takes every recurring expense for its client, dated `periodEnd`, and
every unbilled one dated on or before `periodEnd`, an earlier month's
included, less any in `excludedExpenseIds`. Only the dated ones are attached;
a recurring one bills again on the next invoice.
They follow the service lines as `unit: "expense"` lines carrying `spentOn`,
and `total` is `subtotal + taxAmount + expensesSubtotal`: tax never applies to
a reimbursement.

**Preview before generate is mandatory in the UI.** Generation is the step that
allocates a gapless number and locks entries — it must never be a surprise.

**There is no send endpoint.** The PDF is downloaded and sent by the user from
their own address; `PATCH /status` records that it went out.
`docs/positioning.md` says why.

`grouping_mode` (`summary | entry | task | project | day`) controls whether the
invoice lists every entry or sums them. `summary` is one line per rate
carrying `summaryText`, which the invoice keeps as `summaryText`. Both are
frozen onto the invoice.

## Expenses

A cost the client reimburses, billed by the next invoice for its client, or
by every one when `recurring`. The amount is in the client's currency.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/expenses` | `?clientId&status` — `status` is `open` (default: recurring, unbilled, and on a draft or sent invoice) or `unbilled` (recurring and unbilled). Recurring first, then oldest `spentOn`. Each expense carries `invoiceNumber` and `invoiceStatus` once billed. |
| `POST` | `/expenses` | `{ id, clientId, recurring?, spentOn?, description, amount, note? }`. `spentOn` is required for a one-off and refused with `recurring: true`. `id` is a client-generated UUIDv7, so a retry returns the stored row with `200`. `amount` is above zero. |
| `PATCH` | `/expenses/:id` | Any field from `POST` but `id` and `clientId`. `recurring: true` clears `spentOn`; `false` needs one. **`409 EXPENSE_LOCKED`** once billed on a non-draft invoice; `422` to make a billed one recurring. |
| `DELETE` | `/expenses/:id` | Same lock. A recurring one can always go; invoices that billed it keep their line. |

## Payment details

Bank details live on the **invoice PDF**, and the placement is not a user
preference — `.claude/rules/invoicing.md` has the reason.

`GET|POST /payment-profiles`, `GET|PATCH|DELETE /payment-profiles/:id`.

- A profile is a named bundle of whatever a payer needs; `docs/data-model.md`
  has the field order and which are additive.
- The first profile created becomes the default automatically, and there is
  **one default per user**.
- An invoice prints the profile picked on New invoice (`paymentProfileId` on
  `POST /invoices`); a pick that is archived or gone is `422`, never swapped
  for another. Without a pick, the client's profile (`paymentProfileId`),
  else the user's default; a dangling client reference falls back to the
  default rather than leaving an invoice with nothing.
- Deleting is archival, because clients and invoices reference profiles.

`user_settings.payment_notice` is a standing anti-fraud line printed under the
payment block, defaulted to a warning that details never change and should be
verified by phone.

## Errors

```json
{ "code": "TIMER_ALREADY_RUNNING", "message": "…", "details": { } }
```

| Code | Status | Meaning |
|---|---|---|
| `TIMER_ALREADY_RUNNING` | 409 | Stop the running timer first. |
| `NO_TIMER_RUNNING` | 409 | Nothing to stop. |
| `ENTRY_LOCKED` | 409 | Billed on a non-draft invoice. |
| `EXPENSE_LOCKED` | 409 | An expense billed on a non-draft invoice. |
| `EXPENSE_ALREADY_INVOICED` | 409 | Another invoice took one of this invoice's expenses first. Preview again. |
| `ENTRY_ALREADY_INVOICED` | 409 | One of this invoice's entries was billed on another invoice or deleted since it was loaded. Preview again. |
| `ENTRY_NOT_FOUND` | 404 | |
| `NO_RATE_CONFIGURED` | 400 | No rate at any level for a billable entry. |
| `INVALID_PERIOD` | 400 | |
| `UNAUTHORIZED` | 401 | |
| `IMPORT_FILE_UNRECOGNIZED` | 422 | Not a Toggl export, or a row in it cannot be read; `message` names the line. |
| `VALIDATION_FAILED` | 422 | Zod parse failure (`details` carries the issues), an illegal state change such as deleting an issued invoice or an invalid status transition, or a `PATCH` body that parses but maps to no column. |
| `INTERNAL` | 500 | Unhandled error. Not part of `ErrorCode` in the schema package. |

`ENTRY_NOT_FOUND` is the generic 404 across resources — clients, projects,
invoices, expenses, payment profiles and settings, not only time entries.

**Success statuses:** `201` on a create, `200` on an idempotent replay of one
(a duplicate-key insert with a client-supplied id), `204` on a delete, `200`
otherwise.

**Retry policy:** 409, 5xx and network failures are worth retrying. Other 4xx
are rejections on the merits — an unchanged request fails identically, so
surface them rather than retrying. There is no rate limiting, so nothing here
returns 429; if that changes, it joins the retryable list.

## Timezones

`GET /summary`, `GET /stats` and `GET /calendar` accept a `tz` query
parameter (IANA, e.g. `America/Sao_Paulo`). "Today" is a local-calendar
question and the server cannot infer the caller's zone, so the client states
it; an invalid zone falls back to UTC rather than failing the request, because
a view that renders in the wrong zone beats a view that does not render.

**The invoicing routes reject an invalid one instead.** `POST /invoices/preview`
and `POST /invoices` resolve the billing period in `tz`, so the zone decides
which entries are billed — falling back to UTC there would move the boundary by
hours and put the wrong work on an invoice. An **omitted** `tz` still defaults
to UTC, so a client that means a local period must send one.

Day and week boundaries are computed by `@stint/core/calendar`, which resolves the
offset **at the candidate instant** rather than the current one. Using the
current offset is an hour wrong on DST transition days, which silently files
entries under the wrong date twice a year. Covered by tests across both US
transitions, Europe/London, Australia/Sydney, and Pacific/Chatham's 45-minute
offset.

Calendar grouping happens server-side so all three clients agree on which day
an entry belongs to.
