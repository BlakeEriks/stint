# Contract: `/api/v1/billing`

All but the webhook require a session. Every write answers
`503 BILLING_UNAVAILABLE` while Stripe isn't configured.

## `GET /billing` → `Billing`

```json
{
  "available": true,
  "plan": "paid",
  "status": "active",
  "periodEnd": "2027-10-12T18:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "paymentFailed": false
}
```

No row: `plan: "free"`, `status: null`, `periodEnd: null`,
`cancelAtPeriodEnd: false`, `paymentFailed: false`. Answers even when not
configured, with `available: false`, so the entitlement never depends on
Stripe being reachable.

## `POST /billing/checkout` → `{ "url": "https://checkout.stripe.com/…" }`

| Status | When |
| --- | --- |
| `200` | A Checkout Session for the yearly price |
| `409 ALREADY_SUBSCRIBED` | The user is already paid |
| `503 BILLING_UNAVAILABLE` | Not configured |

Success returns to `/settings?checkout={CHECKOUT_SESSION_ID}`; cancel
returns to `/settings`.

## `POST /billing/portal` → `{ "url": "https://billing.stripe.com/…" }`

| Status | When |
| --- | --- |
| `200` | A Portal session returning to `/settings` |
| `409 NOT_SUBSCRIBED` | The user has no Stripe customer |

## `POST /billing/sync` — body `BillingSync` `{ "sessionId": "cs_…" }` → `Billing`

Re-reads the Checkout Session's customer from Stripe and stores it.

| Status | When |
| --- | --- |
| `200` | The stored state after the sync |
| `404 CHECKOUT_NOT_FOUND` | No such session, or it belongs to another user |

## `POST /billing/webhook` — Stripe only

Raw body, `Stripe-Signature` header.

| Status | When |
| --- | --- |
| `200` | Verified; synced, or acknowledged and ignored |
| `400` | Missing or invalid signature |
| `503` | Not configured |
| `500` | Sync failed; Stripe retries |

## `DELETE /account` (changed)

Cancels the user's Stripe subscription immediately before deleting. If
Stripe refuses, the account is not deleted (500) so nobody is charged after
leaving.
