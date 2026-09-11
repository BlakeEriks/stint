# API Contract — `/api/v1/*`

All clients (web, Expo, Swift) use these endpoints. Auth is a Supabase JWT as
`Authorization: Bearer <token>`. Request/response shapes are defined in
`packages/schema/src/index.ts` — that file is the source of truth; this
document is the map.

All handlers are covered by integration tests that run the real route code
against a real Postgres instance with the real migrations applied
(`apps/web/test/routes.test.ts`) — so the timer index and immutability
triggers are genuinely exercised rather than mocked.

## Timer

The timer is **server-authoritative**. These are the only endpoints whose
behavior depends on global state.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/timer/start` | `{ id?, projectId?, taskName, startedAt? }`. **`409 TIMER_ALREADY_RUNNING`** if one is running — the response includes the running entry so the client can display it. `startedAt` allows backdating a forgotten start. |
| `POST` | `/timer/stop` | `{ endedAt? }`, defaults to server `now()`. `409 NO_TIMER_RUNNING` if none. |
| `GET` | `/timer/current` | `{ entry, exceedsThreshold, maxTimerHours, serverTime }`. |
| `PATCH` | `/timer/current` | Edit task name / project mid-run. |

`serverTime` is returned so clients can correct for clock skew rather than
trusting the device clock.

## Entries

| Method | Path | Notes |
|---|---|---|
| `GET` | `/entries` | `?from&to&projectId&clientId` |
| `POST` | `/entries` | Manual entry. `id` is client-supplied (UUIDv7) so replay is idempotent. Always complete — `endedAt` required. |
| `PATCH` | `/entries/:id` | **`409 ENTRY_LOCKED`** if billed on a non-draft invoice. |
| `DELETE` | `/entries/:id` | Same lock applies. |

## Views

| Method | Path | Notes |
|---|---|---|
| `GET` | `/summary` | **The menu bar endpoint.** Returns `{ running, todaySeconds, weekSeconds, serverTime }` in one call, so the Mac app can toggle between "current timer" and "today's total" without a second request. |
| `GET` | `/calendar` | `?from&to` — entries grouped by day. |

## Clients / projects / settings

Standard CRUD: `GET|POST /clients`, `GET|PATCH|DELETE /clients/:id`, same for
`/projects`. `GET|PATCH /settings`.

Deletion is **archival** (`archivedAt`), never destructive — historical
invoices reference these rows.

## Invoicing

| Method | Path | Notes |
|---|---|---|
| `POST` | `/invoices/preview` | **No side effects.** Returns resolved rates, line items, totals, and `unratedEntryIds`. |
| `POST` | `/invoices` | Allocates the number, freezes line items, locks entries. `400 NO_RATE_CONFIGURED` if any entry has no resolvable rate. |
| `GET` | `/invoices/:id/pdf` | `@react-pdf/renderer`. |
| `POST` | `/invoices/:id/send` | Email to the client. |
| `PATCH` | `/invoices/:id/status` | `draft \| sent \| paid \| void`. |

**Preview before generate is mandatory in the UI.** Generation is the step that
allocates a gapless number and locks entries — it must never be a surprise.

`grouping_mode` (`entry | task | project | day`) controls whether the invoice
lists every entry or sums them. It is frozen onto the invoice.

## Sync

`POST /sync` — `{ mutations[], cursor }` → `{ applied[], rejected[], changes, cursor, serverTime }`

- Max 500 mutations per batch.
- Mutations carry a client UUIDv7, making replay safe.
- Conflicts resolve by `clientUpdatedAt` (last-write-wins), which is correct
  for a single-user dataset.
- `rejected[]` carries a code per mutation — the client drops non-retryable
  ones rather than looping.

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
| `VALIDATION_FAILED` | 422 | Zod parse failure; `details` carries the issues. |

**Retry policy** (`packages/core/src/outbox.ts`): 409, 429, 5xx and network
failures retry with exponential backoff to a 5-minute ceiling. Other 4xx are
rejections on the merits — retrying fails identically, so they dead-letter.

## Timezones

`GET /summary` and `GET /calendar` accept a `tz` query parameter (IANA, e.g.
`America/Sao_Paulo`). "Today" is a local-calendar question and the server
cannot infer the caller's zone, so the client states it; an invalid zone falls
back to UTC rather than failing the request.

Day and week boundaries are computed by `@tt/core/calendar`, which resolves the
offset **at the candidate instant** rather than the current one. Using the
current offset is an hour wrong on DST transition days, which silently files
entries under the wrong date twice a year. Covered by tests across both US
transitions, Europe/London, Australia/Sydney, and Pacific/Chatham's 45-minute
offset.

Calendar grouping happens server-side so all three clients agree on which day
an entry belongs to.
