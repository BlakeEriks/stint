# Research: Say in the Inbox when billable work is past due to bill

## Where the rule lives

- **Decision**: `unbilledDue()` in `packages/core/src/live-draft.ts`, beside `lateEntries()`, called by `readStats` and by the mock.
- **Rationale**: Principle IV, and one implementation for the route and the stories.
- **Alternatives**: a SQL function would put the period rule in a second language, which Principle II then charges a parity test for.

## Which work is due, and what covers it

- **Decision**: per entry. Due when its period has ended (scheduled) or it is more than 30 days old (unscheduled); covered when a non-void invoice for the client holds its day. Grouped into one row per client.
- **Rationale**: the owner's review: a missed period stays until answered, and one row per client. Covering by the day, not by the period, leaves `lateEntries()` every entry inside a sent or paid period, so no entry is in two rows.
- **Alternatives**: only the last ended period drops a missed one silently.

## The answers

- **Decision**: Create invoice links to `?client&from&to`, read once into New invoice's first draft. Billed elsewhere posts the row's `entryIds` to the existing `POST /entries/invoiced-elsewhere`, predicted: the row leaves at once.
- **Rationale**: both reuse what exists; marking is reversible from each entry's dialog, so predicting is allowed by Principle VI.
