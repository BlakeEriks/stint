# Research: New invoice offers to include unbilled work dated just before its period

## Where the rule lives

- **Decision**: `earlierWorkFrom()` and `earlierWork()` in `packages/core/src/billable.ts`, beside `billingWindow()`, called by the preview route and the fake API.
- **Rationale**: Principle IV, and one implementation for the route and the stories.
- **Alternatives**: a SQL function would put the rule in a second language, which Principle II charges a parity test for.

## Where the answer travels

- **Decision**: a field on `POST /invoices/preview`.
- **Rationale**: New invoice already asks for the preview each time the period changes, and the answer depends on the same client, period, zone and edited draft.
- **Alternatives**: a separate route would be a second request on every date typed.

## Work another draft holds

- **Decision**: left out of the count.
- **Rationale**: #596 made drafts hold their work and dropped `DRAFT_OVERLAPS`, so held work is on an invoice already and Include is never refused. A draft holds work dated before the period only once a held entry is re-dated; showing that is the draft's job, not a second state here.
