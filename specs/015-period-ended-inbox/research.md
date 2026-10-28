# Research: Say in the Inbox when a scheduled period has ended with no invoice

## Where the rule lives

- **Decision**: `periodsDue()` in `packages/core/src/live-draft.ts`, beside `lateEntries()`, called by `readStats` and by the mock.
- **Rationale**: Principle IV, and one implementation for the route and the stories. Its inputs are rows `readStats` mostly loads already: the uninvoiced finished entries (the overlap candidates), the drafts, and the sent and paid periods.
- **Alternatives**: a SQL function would put the period rule in a second language, which Principle II then charges a parity test for.

## What covers a period

- **Decision**: a non-void invoice for the client sharing a day with the period.
- **Rationale**: the issue's "no invoice but a void one covering it". Sharing a day, not containing it, so a partial first invoice still answers the period; work outside a sent one is the late-entry row's.
- **Alternatives**: containing the period raises a row beside an invoice the user did create, which reads as wrong.

## How New invoice is filled in

- **Decision**: `?client=<id>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`, read once with `useSearchParams` into the first draft; ignored unless the client is in the list and the dates parse with `from <= to`.
- **Rationale**: a link works from the row, a reload and a bookmark; the page stays static, behind the Suspense boundary `invoices/page.tsx` already uses for `?status=`.
- **Alternatives**: router state or a store dies on reload.
