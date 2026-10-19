# Quickstart: Gate the invoice document

## Billing dark (CI, an unconfigured deploy, local dev)

1. Sign in to local Stint, open any invoice: Download PDF and Preview work
   as before, and no paid-plan line shows.

## Billing configured, without Stripe

The route tests set the Stripe env vars and seed `subscriptions` rows
directly, so every case in [the contract](contracts/invoice-document.md) is
covered without Stripe.

Storybook: `Screens/Invoices/Detail` — the locked story shows Subscribe to
download and the free-records line.

## Suites

```bash
pnpm --filter @stint/core test
scripts/ci-db.sh tt_f61 && DATABASE_URL=…/tt_f61 pnpm --filter @stint/web test
scripts/ci-db.sh tt_f61_rls --rls && … pnpm --filter @stint/web test:rls
pnpm --filter @stint/web test:stories
```
