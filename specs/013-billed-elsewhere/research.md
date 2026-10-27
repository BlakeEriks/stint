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

- **Decision**: one `markable` filter (no invoice, finished) in both routes; the bulk route skips the rest, and `PATCH` reads back to answer `409 ENTRY_ALREADY_INVOICED` or `409 TIMER_ALREADY_RUNNING`. A check constraint, `entry_billed_once`, refuses the other order: an invoice reads unbilled work, then attaches it, and a mark can land between.
- **Rationale**: the filter covers a mark after an attach; only the database covers an attach after a mark. `dbCode` maps the constraint to `ENTRY_ALREADY_INVOICED`, which both attach paths already answer.
- **Alternatives**: filters in the routes alone leave the second order open.
