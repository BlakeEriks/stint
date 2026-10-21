# Quickstart: Subscribe, and know who has

## Without Stripe (what CI and an unconfigured deploy see)

1. `pnpm worktree f60-billing`, `pnpm dev:up`, sign in as the seeded account.
2. Settings has no Plan section. `GET /api/v1/billing` answers
   `available: false, plan: "free"`.
3. Storybook, `Screens/Settings/Plan`: one story per state (free,
   subscribing, confirming, paid, canceling, payment failed).

## With Stripe test mode

1. In a Stripe **test-mode** account: a product "Stint" with one yearly
   price of $40 USD; a webhook endpoint (or `stripe listen --forward-to
   localhost:3101/api/v1/billing/webhook`) for the events in research R3.
2. In `apps/web/.env.development.local`: `STRIPE_SECRET_KEY=sk_test_…`,
   `STRIPE_PRICE_ID=price_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`,
   `SUPABASE_SECRET_KEY` from `supabase status`.
3. Settings → Plan → Subscribe. Pay with `4242 4242 4242 4242`. Back in
   Settings: "Confirming…", then "Paid, renews on {date}".
4. Manage billing → cancel. Settings: "Paid until {date}".
5. In Stripe, use a test clock to advance past the period end. Settings:
   Free. Every invoice is still listed.
6. `4000 0000 0000 0341` (attaches, fails on charge) then advance a test
   clock past renewal: Settings says the payment failed; plan stays paid.

## Suites

```bash
pnpm --filter @stint/core test
DATABASE_URL=…/tt_f60 pnpm --filter @stint/web test
DATABASE_URL=…/tt_f60_rls RLS_DATABASE_URL=…authenticated…/tt_f60_rls pnpm --filter @stint/web test:rls
pnpm verify:schema --url …/tt_f60_rls
pnpm --filter @stint/web test:stories
```
