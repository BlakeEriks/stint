# Research: Subscribe, and know who has

## R1. Hosted Checkout and Customer Portal

- **Decision**: Stripe Checkout (`mode: subscription`) to subscribe; the
  Customer Portal to cancel, resume, update a card and see receipts.
- **Rationale**: No card data touches the app (no PCI scope), the price,
  renewal and terms disclosure is Stripe's page, and the Portal is the
  online cancel that automatic-renewal law asks for. Zero UI to build
  beyond two buttons.
- **Alternatives**: Stripe Elements in-app (more UI, more PCI surface, more
  states to test); a hand-built cancel flow (duplicates the Portal).

## R2. How the webhook writes without a user session

- **Decision**: A service-role Supabase client built from a new server-only
  `SUPABASE_SECRET_KEY`, used only in `lib/billing.ts`. The table grants
  `authenticated` select only and `service_role` select/insert/update.
- **Rationale**: The webhook is called by Stripe, not a user, so RLS has no
  `auth.uid()` to scope by. This is Supabase's documented pattern for
  server-to-server writes and the one in Vercel's subscription template.
- **Alternatives**: A `security definer` function callable by `anon`
  (anyone with the public key could call it, and `verify:schema` rightly
  forbids it); a direct Postgres URL in the app (a broader secret than the
  service key); asking Stripe on every entitlement check (latency, rate
  limits, and a Stripe outage would gate invoices).

## R3. Idempotent, order-independent processing

- **Decision**: The webhook does not apply event payloads. For any
  subscription-related event it takes the customer id and re-reads that
  customer's subscriptions from Stripe, then upserts the one row. The same
  `syncCustomer()` runs from `/billing/sync` after Checkout returns.
- **Rationale**: Stripe does not guarantee order and retries freely. Reading
  current state makes processing the same event twice, or an old event
  late, a no-op by construction, with no event-id table to keep.
- **Alternatives**: Store processed event ids and apply payloads in order
  (more state, and still wrong when events arrive out of order).
- Events handled: `checkout.session.completed`,
  `customer.subscription.created|updated|deleted|paused|resumed`,
  `invoice.paid`, `invoice.payment_failed`. Anything else is acknowledged.

## R4. Linking a Stripe customer to a user

- **Decision**: Checkout sets `client_reference_id` and
  `subscription_data.metadata.user_id` to the user id, and passes the
  stored `customer` when one exists so a returning subscriber keeps one
  customer. Sync reads `user_id` from the subscription's metadata, which
  only our secret key can set. `stripe_customer_id` is unique.
- **Rationale**: No extra Stripe call or extra write before Checkout; the
  link is made by the first sync.
- **Two open payment pages**: Checkout refuses while the user is paid. Two
  pages completed at once would make two subscriptions; sync keeps the paid
  one and reports the duplicate to Sentry for Blake to refund. Rare enough
  not to build more.

## R5. Which state counts as paid

- **Decision**: Paid when status is `active`, `trialing` or `past_due`.
  Free for `incomplete`, `incomplete_expired`, `unpaid`, `canceled`,
  `paused`, or no row. A cancel set for period end stays `active` in
  Stripe until it ends, so it's paid with no special case.
- **Rationale**: `past_due` is the retry window (spec US4). Stripe moves to
  `canceled` when retries are exhausted (Billing settings: "cancel the
  subscription"). The status is the processor's truth (FR-004); comparing
  the period end to the clock would flicker a renewal whose event is late.

## R6. Period end in the current Stripe API

- **Decision**: Read `current_period_end` from the subscription's first
  item. API versions from 2025-03-31 moved it off the subscription. The SDK
  pins its own API version, so the code reads the field the SDK types.

## R7. Testing without Stripe

- **Decision**: `lib/stripe.ts` returns `globalThis.__TEST_STRIPE__` when
  set, like `__TEST_DB__`; `test/fake-stripe.ts` implements the four calls
  used. Webhook tests sign payloads with the SDK's offline
  `webhooks.generateTestHeaderString`, so the real verification runs.
- **Rationale**: No network, no account, no keys; the handlers that ship
  are the ones tested.

## R8. Hidden until configured

- **Decision**: `config()` returns null unless `STRIPE_SECRET_KEY`,
  `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` are all set. Then every
  billing write answers `503 BILLING_UNAVAILABLE`, `GET /billing` says
  `available: false`, and the Plan section isn't rendered.
- **Rationale**: Merging is the deploy. Blake turns billing on when #61's
  gate is ready, by setting env vars, not by shipping code.

## R9. Dunning and reminders

- **Decision**: Stripe Billing settings, configured by Blake: Smart Retries
  (8 attempts, 2 weeks), then cancel; customer emails on failed payment and
  for upcoming renewals; the Portal allows cancel at period end, resume and
  card update. The app shows "payment failed" from `past_due`/`unpaid`.
- **Rationale**: Built and tuned by Stripe; costs nothing; the app sends no
  mail.

## R10. Sales tax and terms

Decided in the spec's Clarifications: no tax at launch (Stripe Tax off);
Terms gets a Billing clause replacing the "Stint is free" price clause,
marked in source as needing legal review. Checkout's `custom_text.submit`
restates the renewal next to the pay button.
