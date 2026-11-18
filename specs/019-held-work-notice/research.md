# Research: New invoice says when a draft holds this period's work

## Where the rule lives

- **Decision**: `heldWork()` in `packages/core/src/billable.ts`, beside `earlierWork()`, called by the preview route and the fake API.
- **Rationale**: Principle IV, and one implementation for the route and the stories.
- **Alternatives**: counting in the route alone would leave the stories' fake API to repeat it.

## Where the answer travels

- **Decision**: a field on `POST /invoices/preview`.
- **Rationale**: New invoice already asks for the preview each time the client or period changes, and the answer depends on the same client, period, zone and edited draft.

## What the notice offers

- **Decision**: a link to the draft, no button.
- **Rationale**: The work is that draft's (#596). Moving it here would be a second way to edit a draft; the draft is where she adds to it or deletes it.
