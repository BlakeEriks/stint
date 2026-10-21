# Research: First-run setup

## Who sees the welcome dialog

- **Decision**: A nullable `user_settings.welcomed_at`. The migration sets it
  to `now()` on every existing row; the signup trigger leaves it null.
- **Rationale**: Shows once per account across devices (FR-009), never to
  accounts from before (FR-006), and survives a skip, which a derived "no
  rate, no clients, no entries" check would not.
- **Alternatives**: Derived state (reappears after a skip); localStorage (per
  device, and a second browser shows it again).

## How the flag is written

- **Decision**: `PATCH /settings` accepts `welcomedAt` as an ISO timestamp,
  sent once when the dialog closes by any path.
- **Rationale**: Reuses the one settings write and its autosave invalidation;
  no new route. The value is informational, so the client's clock is enough.
- **Alternatives**: A `POST /settings/welcomed` route (a second write path for
  one column).

## Where the rate row's condition lives

- **Decision**: `/stats` `attention.noDefaultRate: boolean`, from the
  settings row the route already reads.
- **Rationale**: The Inbox renders only `attention`, and `inboxCount` must
  count the row for the dock strip too (FR-002). Keeping it on `attention`
  means the strip needs no second query.
- **Alternatives**: Reading `/settings` in the Inbox (a second source for one
  row, and the strip would have to read it as well).

## Seeds

- **Decision**: `supabase/seed.sql` and `apps/web/e2e/reset-seed.sql` set
  `welcomed_at` on the accounts they seed.
- **Rationale**: Without it, the seeded account and every e2e test open onto
  the welcome dialog. A story or e2e case that wants the dialog uses a
  fixture with `welcomedAt: null`.

## Server-side business-details check

- **Decision**: `POST /invoices` refuses with `VALIDATION_FAILED` while
  business name or email is empty.
- **Rationale**: Constitution III; the macOS app or a script must not
  generate what the web forbids (FR-013).
