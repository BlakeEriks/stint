# API Contract — `/api/v1/*`

All clients (web, Expo, Swift) use these endpoints. Auth is a Supabase JWT as
`Authorization: Bearer <token>`. Request/response shapes are defined in
`packages/schema/src/index.ts` — that file is the source of truth, and every
route parses its request against it; this document is the map.

Handlers are covered by integration tests that run the real route code against
a real Postgres instance with the real migrations applied
(`apps/web/test/routes.test.ts`, `apps/web/test/invoices.test.ts`) — so the
timer index and immutability triggers are genuinely exercised rather than
mocked. Those tests disable RLS; **`apps/web/test/rls.test.ts` covers RLS
separately**, connecting as a non-superuser role with the policies live.

Every handler is covered — 37 of 37, counting handlers rather than files.

## Timer

The timer is **server-authoritative**. These are the only endpoints whose
behavior depends on global state.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/timer/start` | `{ id?, projectId?, taskName?, startedAt?, isBillable? }` — `taskName` defaults to `''`, since a timer started in a hurry can be named later. Returns `201`. **`409 TIMER_ALREADY_RUNNING`** if one is running, with the running entry in `details.running` so the client can display it rather than just reporting a conflict. `startedAt` allows backdating a forgotten start. **`isBillable` omitted leaves the column's `true` default**; it is sent only when starting from a past entry, which carries that entry's own answer so resumed internal work does not come back billable. |
| `POST` | `/timer/stop` | `{ endedAt? }`, defaults to server `now()`. `409 NO_TIMER_RUNNING` if none; `422 VALIDATION_FAILED` if a backdated `endedAt` is at or before `startedAt`. |
| `GET` | `/timer/current` | `{ entry, exceedsThreshold, maxTimerHours, serverTime }`. |
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

## Views

| Method | Path | Notes |
|---|---|---|
| `GET` | `/summary` | **The menu bar endpoint.** Returns `{ running, todaySeconds, weekSeconds, exceedsThreshold, maxTimerHours, serverTime }` in one call, so the Mac app can toggle between "current timer" and "today's total" without a second request. |
| `GET` | `/calendar` | `?from&to` (**both required**) `&tz&granularity`. Returns `{ days: [...] }`. `400 INVALID_PERIOD` if `to < from`. |
| `GET` | `/calendar?granularity=day` | Day totals only — `{ date, totalSeconds, byClient }` per day, no entries. Backs the home screen's activity chart, where a month of full entries is a heavy payload for something drawing one column per day. `byClient` keys by client id with `''` for internal work, and running entries are excluded. |
| `GET` | `/stats` | `?tz` — the home screen cards **and the dock's inbox** in one call: `currency`, `unbilled` (by client with aging, capped at **5 rows** plus a `moreClients` count — the total still covers every client), `earnedToday`, `awaitingPayment`, `pace`, `billableRatio`, and `attention` . **`earnedToday` is work done today at its resolved rate**, bucketed by the entry's own date in `tz` from the same `revenue_by_day()` series the pace ray uses — a property of the data, so it reads the same on every device; unrated work earns nothing it can name, so it can understate a day whose rate chain resolves to null. One request because they render together and a set that pops in piecemeal reads as broken. **`awaitingPayment` is invoiced-not-yet-collected and must never be summed with `unbilled.total`** — that would double-count the same hours. The attention rows are **derived per request** from stored facts, and carry grace periods: an invoice is overdue at `due_date` **+ 7 days**, a draft is stale **7 days** after issue. One row whose condition never stops holding on its own is gated by a stored answer instead — `duration_ok` on an entry of unusual length — so it cannot return every day once answered, and nothing else is remembered. Unbilled totals come from the `unbilled_by_client` SQL rollup, grouped by (client, rate); a client-less row reports `clientName: "No client"`. `velocity` is the trailing **3 whole months** from `revenue_by_client()`, gross work done split `invoiced` vs `unbilled` (the two sum to `total`), per client and capped at the same 5 rows. The home screen renders the gross and the per-client mix but **not** the split: its window opens on the 1st three months back, so `velocity.unbilled` parts from `unbilled.total` only when work has gone unbilled past that boundary, and printing both put the same figure on screen twice in the ordinary case. `perMonth` is `total / months` rounded to cents **on the server**; the client never divides money. It uses the same rate chain and the same group-by-(client, rate) shape as the unbilled rollup, so the two figures agree; it is **not** comparable with `awaitingPayment`, which spans every period. `pace` carries a `series`: one point per **business day** of the month, each with the cumulative `actual` (null past today) and the goal ray's `expected`. The ray steps on business days only — one sloping through the weekend would show the user behind every Saturday and recovered every Monday. A **revenue** target gets the same ray, its `actual` from `month_revenue()` and its series from `revenue_by_day()`; it counts work DONE (invoiced plus unbilled at its resolved rate) bucketed by the entry's date, never the invoice's `issue_date`, and a voided invoice releases its entries. `unprojected` is one row per entry, oldest first, and `strangeDurations` one per entry of implausible length (`kind` is `short` or `long`; both thresholds live on `user_settings` and default to null, so the row is opt-in). The runaway timer is the inbox's fifth row and comes from `/summary`, not here. Quiet clients are not built (`tasks.md`). Specified in `docs/design/screens/home.html`. |
| `GET` | `/entries/task-names` | `?projectId&limit` (1–20, default 8). Returns `{ taskNames: [{ taskName, projectId, lastUsedAt }] }` — names the user has typed before, for suggesting one rather than retyping it. One row per name **case-insensitively**, keeping the most recent spelling, since offering both is offering the user their own typo; the empty name is excluded, so a timer started in a hurry never becomes a suggestion. **`projectId` ranks, it does not filter** — names used with that project come first and every other name still follows, so there is no `none` literal as there is on `/entries`: "no project" and "no preference" are one request. Omitting it ranks by recency alone. Ranking is the server's and clients must not re-sort it; filtering as the user types is theirs. Backed by the `recent_task_names` SQL function. |

## Clients / projects / settings

Standard CRUD: `GET|POST /clients`, `GET|PATCH|DELETE /clients/:id`, same for
`/projects` and `/payment-profiles`. `GET|PATCH /settings`.

`POST` on all three accepts an optional client-supplied `id` (UUIDv7); a
duplicate-key insert returns the existing row with `200` rather than an error,
so a retried request is idempotent. A fresh create returns `201`.

**`clientId` on a project is optional and nullable**, so a body carrying only
a name creates internal work — which is how unbillable time is modelled, and
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
promotes the next profile by name. Without that, resolution falls through to
null and the next invoice carries no bank details.

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
| `POST` | `/invoices/preview` | **No side effects.** `{ clientId, periodStart, periodEnd, groupingMode?, tz? }` → `lineItems`, `subtotal`, `taxRate`, `taxAmount`, `total`, `entryCount`, `unratedEntryIds`, plus `clientId`, `clientName`, `currency`, the echoed period and `groupingMode`. `400 INVALID_PERIOD` if `periodEnd < periodStart`; `422 VALIDATION_FAILED` if `tz` is not an IANA zone. |
| `POST` | `/invoices` | Allocates the number, freezes line items **and payment details**, locks entries. Also accepts `issueDate`, `dueDate`, `notes`, `paymentTerms`, `tz`. Returns the `Invoice` plus `lineItems` and `entryCount`. `400 NO_RATE_CONFIGURED` if any entry has no resolvable rate; `400 INVALID_PERIOD` if the period holds no billable time; `422 VALIDATION_FAILED` on an invalid `tz`. |
| `GET` | `/invoices/:id` | Invoice + frozen line items + the client's `{ id, name, email, address }` (not the full client row). Returned **flat**, like every other detail route. These `lineItems` carry `id` and `sortOrder`; the ones a preview or a generation returns carry `rateSource` and `entryIds` instead. |
| `DELETE` | `/invoices/:id` | **Drafts only** — `422 VALIDATION_FAILED` otherwise. An issued invoice must be voided, so numbering stays gapless. Releases its entries. |
| `GET` | `/invoices/:id/pdf` | Streams `application/pdf` from the frozen line items. `?download=1` for `attachment` rather than an inline preview. |
| `PATCH` | `/invoices/:id/status` | `{ status, sentAt?, paidAt? }`. Also how an invoice is marked sent. `422 VALIDATION_FAILED` on a transition the table below forbids. |

**Status transitions are constrained:** draft→sent/void, sent→paid/void,
paid→void. `void` is terminal, and setting a status to its current value is a
no-op rather than an error.
Nothing returns to draft — leaving `draft` is what locked the entries, and
reopening would let billed time change after the client saw it. Voiding
releases the entries for re-billing while the number stays on record.

**Excluded from billing:** running timers (you cannot bill time still
accruing), non-billable entries, and entries already attached to an invoice.

**Preview before generate is mandatory in the UI.** Generation is the step that
allocates a gapless number and locks entries — it must never be a surprise.

**The app does not email invoices.** You download the PDF and send it from
your own address, then record that with `PATCH /status`. Mail sent from a
shared application domain gets filtered or blocked on the way to a client, and
you find out when they say it never arrived. Sending it yourself uses your own
domain's reputation and leaves the invoice in your Sent folder.

`grouping_mode` (`entry | task | project | day`) controls whether the invoice
lists every entry or sums them. It is frozen onto the invoice.

## Payment details

Bank details live on the **invoice PDF**. That is the convention every major
invoicing tool follows, and it is the safer posture: details that render
identically on every invoice create a baseline, so a *change* becomes visible
and questionable — which is exactly what fraud-prevention guidance tells
payers to challenge. (The app sends no mail at all, so the PDF is the only
place they could go.)

`GET|POST /payment-profiles`, `GET|PATCH|DELETE /payment-profiles/:id`.

- A profile is a named bundle of whatever a payer needs. **US-first**: account
  number + ACH routing number is the default path; IBAN/SWIFT, a labelled
  national bank code, and intermediary-bank fields are additive and render
  only when populated.
- The first profile created becomes the default automatically — otherwise a
  user who never ticks the box gets invoices with no payment details.
- **One default per user**, enforced by a partial unique index.
- A client may point at a specific profile (`paymentProfileId`); otherwise the
  user's default applies. A dangling reference falls back to the default
  rather than leaving an invoice with nothing.
- Deleting is archival, because clients and invoices reference profiles.

**Invoices freeze the rendered details** into `payment_details` (JSONB) at
generation, exactly as they freeze rates. Editing or deleting a profile later
never alters an issued invoice.

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
| `ENTRY_NOT_FOUND` | 404 | |
| `NO_RATE_CONFIGURED` | 400 | No rate at any level for a billable entry. |
| `INVALID_PERIOD` | 400 | |
| `UNAUTHORIZED` | 401 | |
| `VALIDATION_FAILED` | 422 | Zod parse failure (`details` carries the issues), an illegal state change such as deleting an issued invoice or an invalid status transition, or a `PATCH` body that parses but maps to no column. |
| `INTERNAL` | 500 | Unhandled error. Not part of `ErrorCode` in the schema package. |

`ENTRY_NOT_FOUND` is the generic 404 across resources — clients, projects,
invoices, payment profiles and settings, not only time entries.

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
