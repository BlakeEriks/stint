# API Contract — `/api/v1/*`

All clients (web, Expo, Swift) use these endpoints. Auth is a Supabase JWT as
`Authorization: Bearer <token>`. Request/response shapes are defined in
`packages/schema/src/index.ts` — that file is the source of truth; this
document is the map.

Every implemented handler is covered by integration tests that run the real
route code against a real Postgres instance with the real migrations applied
(`apps/web/test/routes.test.ts`, `apps/web/test/invoices.test.ts`) — so the
timer index and immutability triggers are genuinely exercised rather than
mocked. Those tests disable RLS; **`apps/web/test/rls.test.ts` covers RLS
separately**, connecting as a non-superuser role with the policies live.

Anything marked **(not implemented)** below is a specification, not shipped
behavior.

## Timer

The timer is **server-authoritative**. These are the only endpoints whose
behavior depends on global state.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/timer/start` | `{ id?, projectId?, taskName, startedAt? }`. **`409 TIMER_ALREADY_RUNNING`** if one is running — the response includes the running entry so the client can display it. `startedAt` allows backdating a forgotten start. |
| `POST` | `/timer/stop` | `{ endedAt? }`, defaults to server `now()`. `409 NO_TIMER_RUNNING` if none. |
| `GET` | `/timer/current` | `{ entry, exceedsThreshold, maxTimerHours, serverTime }`. |
| `PATCH` | `/timer/current` | Edit task name / project mid-run. `409 NO_TIMER_RUNNING` if none; `409 ENTRY_LOCKED` if billed. |

`serverTime` is returned so clients can correct for clock skew rather than
trusting the device clock.

## Entries

| Method | Path | Notes |
|---|---|---|
| `GET` | `/entries` | `?from&to&projectId&clientId&limit` (1–500, default 200) |
| `GET` | `/entries/:id` | |
| `POST` | `/entries` | Manual entry. `id` is client-supplied (UUIDv7) so a retry is idempotent. Always complete — `endedAt` required. |
| `PATCH` | `/entries/:id` | **`409 ENTRY_LOCKED`** if billed on a non-draft invoice. Returns `409 TIMER_ALREADY_RUNNING` if clearing `endedAt` would reopen this entry while another timer runs. |
| `DELETE` | `/entries/:id` | Same lock applies. |

## Views

| Method | Path | Notes |
|---|---|---|
| `GET` | `/summary` | **The menu bar endpoint.** Returns `{ running, todaySeconds, weekSeconds, exceedsThreshold, maxTimerHours, serverTime }` in one call, so the Mac app can toggle between "current timer" and "today's total" without a second request. |
| `GET` | `/calendar` | `?from&to` (**both required**) `&tz` — entries grouped by local day. |
| `GET` | `/calendar?granularity=day` | Day totals only — `{ date, totalSeconds, byClient }` per day, no entries. Backs the home screen's activity strip, where twelve weeks of full entries is a heavy payload for one rectangle per day. `byClient` keys by client id with `''` for internal work, and running entries are excluded. |
| `GET` | `/stats` | `?tz` — the home screen card set in one call: unbilled by client with aging, month-to-date against target, billable ratio, and the attention rows (overdue invoices, stale drafts, unprojected entries). One request because the cards render together and a set that pops in piecemeal reads as broken. Unbilled totals come from the `unbilled_by_client` SQL rollup, grouped by (client, rate). Quiet clients are not yet included. Specified in `docs/design/home.md`. |

## Clients / projects / settings

Standard CRUD: `GET|POST /clients`, `GET|PATCH|DELETE /clients/:id`, same for
`/projects` and `/payment-profiles`. `GET|PATCH /settings`.

`POST` on all three accepts an optional client-supplied `id` (UUIDv7); a
duplicate-key insert returns the existing row with `200` rather than an error,
so a retried request is idempotent.

Deletion is **archival** (`archivedAt`), never destructive — historical
invoices reference these rows.

`nextInvoiceNumber` is not settable through `PATCH /settings`: gapless
numbering depends on `allocate_invoice_number()` holding the row lock.

## Invoicing

| Method | Path | Notes |
|---|---|---|
| `GET` | `/invoices` | `?clientId&status&limit`, newest first. |
| `POST` | `/invoices/preview` | **No side effects.** `{ clientId, periodStart, periodEnd, groupingMode?, tz? }` → resolved rates, line items, totals, `unratedEntryIds`, plus `clientName`, the echoed period and `groupingMode`. |
| `POST` | `/invoices` | Allocates the number, freezes line items **and payment details**, locks entries. Also accepts `issueDate`, `dueDate`, `notes`, `paymentTerms`, `tz`. `400 NO_RATE_CONFIGURED` if any entry has no resolvable rate; `400 INVALID_PERIOD` if the period holds no billable time. |
| `GET` | `/invoices/:id` | Invoice + frozen line items + client. |
| `DELETE` | `/invoices/:id` | **Drafts only** — `422 VALIDATION_FAILED` otherwise. An issued invoice must be voided, so numbering stays gapless. Releases its entries. |
| `GET` | `/invoices/:id/pdf` | Streams `application/pdf` from the frozen line items. `?download=1` for `attachment` rather than an inline preview. |
| `PATCH` | `/invoices/:id/status` | `{ status, sentAt?, paidAt? }`. Also how an invoice is marked sent. |

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
| `VALIDATION_FAILED` | 422 | Zod parse failure (`details` carries the issues), or an illegal state change such as deleting an issued invoice. |
| `INTERNAL` | 500 | Unhandled error. Not part of `ErrorCode` in the schema package. |

`ENTRY_NOT_FOUND` is the generic 404 across resources — clients, projects,
invoices, payment profiles and settings, not only time entries.

**Retry policy:** 409, 429, 5xx and network failures are worth retrying.
Other 4xx are rejections on the merits — an unchanged request fails
identically, so surface them rather than retrying.

## Timezones

`GET /summary` and `GET /calendar` accept a `tz` query parameter (IANA, e.g.
`America/Sao_Paulo`). "Today" is a local-calendar question and the server
cannot infer the caller's zone, so the client states it; an invalid zone falls
back to UTC rather than failing the request.

Day and week boundaries are computed by `@stint/core/calendar`, which resolves the
offset **at the candidate instant** rather than the current one. Using the
current offset is an hour wrong on DST transition days, which silently files
entries under the wrong date twice a year. Covered by tests across both US
transitions, Europe/London, Australia/Sydney, and Pacific/Chatham's 45-minute
offset.

Calendar grouping happens server-side so all three clients agree on which day
an entry belongs to.
