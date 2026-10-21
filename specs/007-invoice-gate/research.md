# Research: Gate the invoice document

## R1. How "generated while paying" is known

- **Decision**: A column on `invoices`, `issued_subscription_status`, set by
  a `before insert` trigger from the user's `subscriptions` row (null when
  there is none). An update that changes it is refused. `planOf()` reads it.
- **Rationale**: `subscriptions` mirrors only Stripe's current record; it
  holds no history, so the plan at a past moment can't be recovered later.
  Recording it at generation is the only exact answer. A trigger, not the
  route: `create_invoice` is `security invoker` and callable by any
  `authenticated` user through PostgREST, so a value passed in could be
  forged. `subscriptions` is written only by `service_role`, so a value
  copied from it can't be. Copying the status, not a boolean, keeps "paid"
  in `planOf()` alone, so there is no SQL twin of the rule (Principle II).
- **Alternatives considered**: Compare the invoice's `created_at` with the
  subscription's `current_period_end` — needs no migration, but a
  subscription Stripe ends after failed retries keeps a period end up to a
  year ahead, unlocking every invoice generated in that free year. A
  boolean set by the route — forgeable through the RPC. A history table of
  plan changes — more than the one question needs.

## R2. Where the gate runs

- **Decision**: In `GET /invoices/:id/pdf`, after the invoice loads (so a
  missing or another user's invoice is 404 first) and before rendering.
- **Rationale**: The issue names it as the boundary; both dispositions go
  through it, so the query parameter is irrelevant. 404 before 402 means the
  gate reveals nothing about other accounts.

## R3. The rule

- **Decision**: `documentOpens(billingAvailable, plan, issuedStatus)` in
  `packages/core/src/billing.ts`: `!billingAvailable || plan === 'paid' ||
  planOf(issuedStatus) === 'paid'`.
- **Rationale**: One pure function the route and the detail response share.

## R4. The refusal

- **Decision**: `402 PAYMENT_REQUIRED`, message "Downloading an invoice is
  on the paid plan. Subscribe in Settings."
- **Rationale**: 402 is the status for exactly this; a distinct code lets a
  client branch on it.

## R5. Telling the screen

- **Decision**: `GET /invoices/:id` adds `canDownload: boolean`, computed by
  the same function. The list doesn't carry it.
- **Rationale**: The screen must know before the press (FR-008), and the
  server owns the answer. One field on the detail route avoids a second
  request and a client copy of the rule.

## R6. A failed plan read

- **Decision**: `entitlement()` throws on a read error, and the handler
  answers 500.
- **Rationale**: Fails closed without a false "pay to open" message, and an
  unexpected error is never swallowed.
