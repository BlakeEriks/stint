# Research: A draft changes only when you change it

## How a draft holds work

- **Decision**: `draft_id uuid` on `time_entries` and `expenses`, a composite
  key `(draft_id, user_id)` to `invoices (id, user_id)`, `on delete set null
  (draft_id)`.
- **Rationale**: one column makes "held by at most one draft" true by
  construction. Deleting a draft releases its work with no code. `invoice_id`
  keeps meaning "billed", so the Inbox, stats, expense lists, exports and the
  entry lock read held work as unbilled, as today.
- **Alternatives**: `invoice_id` set at build, as before #467. Every reader
  of "unbilled" would then need a draft exception. A join table would be a
  new table with its own RLS for the same guarantee.

## Lines: stored or priced on read

- **Decision**: priced on read from held work (`deriveDraft` over the held
  scope).
- **Rationale**: an edit to held work, or a rate, then shows with no write
  path rebuilding drafts. New work cannot join, which is what the owner
  asked for.
- **Alternatives**: store all lines at build and rebuild on every entry,
  expense and rate write. Every write path would need to rebuild the drafts
  it touches, and a missed one sends stale lines.

## Leaving a client

- **Decision**: triggers clear `draft_id` when an entry's `project_id`
  changes client, or its whole project does. An expense's client can't be
  changed through the API, so it gets none (Constitution VII).
- **Rationale**: otherwise the moved work stays held by a draft that no
  longer prices it, and the other client's drafts never offer it.

## Saving the edit screen

- **Decision**: a save is a build. It holds the period's buildable work and
  releases held work outside the dates.
- **Rationale**: the form previews the whole period before the press.
  #583 revisits this when every change saves.

## Mark sent's dates

- **Decision**: `downloaded_snapshot` keeps only `issueDate`, `dueDate` and
  `template`. Nothing compares it.
