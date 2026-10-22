# Data model: Subscribe, and know who has

## `subscriptions` (new table, migration 20261012173556_subscriptions.sql)

One row per user who has ever reached Checkout's completion. A mirror of
Stripe's record, written only by the server.

| Column | Type | Rule |
| --- | --- | --- |
| `user_id` | uuid, PK | references `auth.users(id)` on delete cascade |
| `stripe_customer_id` | text, not null, unique | one customer, one user |
| `stripe_subscription_id` | text, not null | the subscription mirrored |
| `status` | text, not null | Stripe's status; check in the eight Stripe values |
| `current_period_end` | timestamptz, not null | renews or ends then |
| `cancel_at_period_end` | boolean, not null default false | |
| `updated_at` | timestamptz, not null default now() | |

- RLS on. Policy `select_own_subscription`: `user_id = auth.uid()`.
- Grants: `select` to `authenticated`; `select, insert, update` to
  `service_role`; nothing to `anon`.
- No client-generated id: the key is the user.

## Plan (derived, `packages/core/src/billing.ts`)

```text
planOf(status | null) -> 'free' | 'paid'
paid   = active | trialing | past_due
failed = past_due | unpaid        (paymentFailed)
```

## State transitions (Stripe's, mirrored)

```text
(none) --checkout paid--> active
active --cancel in Portal--> active + cancel_at_period_end
active + cancel --resume--> active
active + cancel --period ends--> canceled
active --renewal fails--> past_due --retry succeeds--> active
past_due --retries exhausted--> canceled
any --account deleted--> canceled at Stripe, row cascades
```
