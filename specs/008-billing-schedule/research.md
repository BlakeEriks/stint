# Research: Bill each client on its own schedule

## R1. Shape on the wire

- **Decision**: One field, `billingSchedule`: `null`, `{ period: 'semimonthly' | 'monthly' }`, or `{ period: 'weekly' | 'biweekly', anchor: 'YYYY-MM-DD' }`, a Zod discriminated union.
- **Rationale**: The period and its anchor are one value. Sending them together means a PATCH can never leave a weekly schedule without an anchor, so no route reads the row to validate, and Zod refuses a bad pair with 422 before the database sees it.
- **Alternatives considered**: Two flat fields, as the columns are: a PATCH of one could break the pair, caught only by the check as a 500. A `jsonb` column: loses the database's check on the period's values.

## R2. Storage

- **Decision**: `billing_period text null` checked against the four kinds, and `period_anchor date null`, with a check that weekly and biweekly carry an anchor and the others carry none.
- **Rationale**: The check is the backstop for any writer that skips Zod. Null is "no schedule", so existing rows need no backfill (spec FR-001).

## R3. The rule

- **Decision**: `packages/core/src/schedule.ts`:
  - `periodContaining(date, schedule)`: monthly is the calendar month; semimonthly is the 1st–15th or the 16th–last day; weekly and biweekly count 7 or 14 days from the anchor, by floor division, so dates before the anchor work too.
  - `lastEndedPeriod(today, schedule)`: the period before `periodContaining(today)`, since the period holding today has not ended (spec edge case: a period ends after its last day).
  - `isPeriod(schedule, start, end)`: `periodContaining(start)` equals `{ start, end }`.
  - `defaultInvoicePeriod(today, schedule)` in `invoice.ts` returns `lastEndedPeriod()` when there is a schedule, and today's nearest-month rule when it is null.
- **Rationale**: One function decides periods (FR-004); the others are one line each over it. Day arithmetic goes through UTC dates, as `addDays` does, so no timezone or DST shift moves a period.

## R4. The form

- **Decision**: Carry over PR #423's New invoice wiring: `periodStart` and `periodEnd` are `null` until the user edits one, so the client's schedule decides them; editing either pins both. The hint is `type-support text-warning`, shown only when both dates are set and the client has a schedule.
- **Rationale**: It was built, reviewed and seen working in #423; only the rule underneath changes.
- **Hint copy**: "{Client} is billed {weekly | every two weeks | twice a month | monthly}, and this isn't one of its periods."

## R5. The client dialog

- **Decision**: A "Billing schedule" select (None, Weekly, Every two weeks, Twice a month: 1st–15th and 16th–end, Monthly). Weekly and every two weeks reveal a "First period starts" date, prefilled with today's Monday so a save never lacks one. The client list's row adds the schedule in its support line when there is one.
- **Rationale**: Follows the dialog's existing `Field` and `Select`; the design review was skipped for this reason.
