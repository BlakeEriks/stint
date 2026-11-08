# Research: Say in the Inbox when a client is ready to invoice

## Where the rule lives

- **Decision**: `unbilledDue()` in `packages/core/src/live-draft.ts`, beside `lateEntries()`, called by `readStats` and by the mock.
- **Rationale**: Principle IV, and one implementation for the route and the stories.
- **Alternatives**: a SQL function would put the period rule in a second language, which Principle II then charges a parity test for.

## Which work counts

- **Decision**: per client, `lastEndedPeriod()` of its schedule. No row when a non-void invoice for the client overlaps that period; otherwise the entries dated in it count.
- **Rationale**: the owner's review: one period, one client, one row, and a row that clears by itself when the next period ends. Over a partial invoice the link would be refused by a draft or pull in a sent invoice's late entries.
- **Alternatives**: covering per entry keeps work beside a partial invoice flagged, but sends the link where New invoice refuses it.

## The link

- **Decision**: `?client&from&to`, read once into New invoice's first draft.
- **Rationale**: it reuses the form; the user makes the draft, so nothing is numbered or written from the Inbox.
