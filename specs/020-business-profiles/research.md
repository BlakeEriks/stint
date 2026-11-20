# Research: Invoices can come from more than one business

## Numbering

- **Decision**: one sequence across the account, as today.
- **Rationale**: `sequence_no` orders the invoice list and the export, finds a client's last invoice (`live-draft.ts`), orders drafts (`billable.ts`) and bounds the next number (`refusals.ts`). A counter per business changes each. US invoices carry no per-entity numbering rule, and a per-business counter can be added later without renumbering anything sent.
- **Alternatives**: a prefix and counter per business, with the unique rules on `(business_profile_id, …)`: right for separate books, and twice this feature.

## The client's business

- **Decision**: carried from the client's last invoice, as grouping and reference are.
- **Alternatives**: `clients.business_profile_id`, as the issue proposed: a column and a screen to set it, when the last invoice already records the answer.

## Payment details per business

- **Decision**: none. The existing chain (pick, client, default) resolves them.

## Logo

- **Decision**: `logo_url` per business, a URL, set through the API as today.

## Sharing with payment profiles

- **Decision**: the one-default rules move to `lib/profiles.ts`, parameterized by table; the Settings list and the New invoice menu become one component each, used by both kinds.
- **Rationale**: `.claude/rules/changes.md`: a copied pattern is extracted, and the original moves onto it.
