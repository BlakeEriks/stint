# Research: Payment terms are a number of days

## Where the due date is decided

- **Decision**: `POST /invoices` fills a missing `dueDate` from the client's days, else the user's; New invoice predicts the same date.
- **Rationale**: Clarification 3; auto-drafting (#434) creates invoices with nobody to pick a date.
- **Alternatives**: client-only default (today) leaves API-made invoices with no due date.

## Generated terms text

- **Decision**: `paymentTermsText(issue, due)`: same day → "Due on receipt", else `Net ${daysBetweenKeys(issue, due)}`. Generated at creation, frozen in `invoices.payment_terms`.
- **Rationale**: Clarification 1; the text can't disagree with the dates. `refresh_draft` never writes `payment_terms` or `due_date`, so a draft keeps both.
- **Alternatives**: rendering from days at PDF time would change an issued invoice when settings change.

## Early due dates

- **Decision**: `422 VALIDATION_FAILED` on `dueDate < issueDate`; New invoice shows the message under Due and disables Generate.
- **Rationale**: Clarification 2.

## Migrating free text

- **Decision**: `legacy_payment_terms_days(text) returns int` — the current rule in Postgres regex (`net\s*(\d{1,4})(?!\d)`, then `(?<!\d)(\d{1,4})\s*days`, then `receipt` → 0), null when unreadable or over 365. The backfill sets `payment_terms_days = coalesce(f, 30)` and keeps the text in `legacy_payment_terms` when `f` is null.
- **Rationale**: Principle I; the function is testable against real Postgres. Execute is revoked from `anon` and `authenticated` (`verify:schema`).
- **Alternatives**: parsing in TypeScript during a deploy step — production migrates in SQL only.

## The notice

- **Decision**: `attention.paymentTermsToCheck` (the old text, or null). The inbox row works like the missing-rate row: it quotes the text, says invoices now print Net 30, and holds a days field with Save. Any settings save that includes `paymentTermsDays` clears `legacy_payment_terms`.
- **Rationale**: the rate row is the established pattern for a one-per-user chore; answering in place beats a trip to Settings.
