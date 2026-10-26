# Research: Mark entries as billed outside Stint

## The model

- **Decision**: the existing `invoiced_elsewhere` flag.
- **Rationale**: `unbilled_by_client`, `loadBillableEntries`, Home's figures and the inbox already skip it, and Earned counts it.
- **Alternatives**: a recorded external invoice reuses the "billed" checks but adds a table, a number, and a status every invoice list must leave out.

## What a press marks

- **Decision**: ids, from the card's time lines (`lineItems[].entryIds`).
- **Rationale**: Principle I: an entry logged after the card loaded isn't marked. The same body clears, so Undo sends back the ids the mark returned.
- **Alternatives**: a client and date range is one less thing for the client to send, but marks what the user hasn't seen.

## Guarding invoiced entries

- **Decision**: the update filters `invoice_id is null` and `ended_at is not null`; the bulk route skips the rest, and `PATCH` reads back to answer `409 ENTRY_ALREADY_INVOICED`.
- **Rationale**: Postgres rechecks the filter on the locked row, so a concurrent `create_invoice` can't leave an entry both claimed and flagged. `create_invoice` already skips flagged entries.
- **Alternatives**: a check constraint needs a migration for a state no write path makes.
