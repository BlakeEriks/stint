# Quickstart: Bill each client on its own schedule

## Local

1. Sign in to local Stint, edit Northwind Trading: Billing schedule reads None.
2. Set Twice a month, save, open New invoice, choose Northwind: on Oct 21 the dates are Oct 1–15.
3. Change From to Oct 10: the hint shows, and Generate invoice works.
4. Set Weekly starting Mon Oct 5: New invoice gives Mon Oct 12 – Sun Oct 18.
5. Set None: New invoice gives the nearest month, as before.

Storybook: `Screens/Clients` and `Screens/Invoices/New` hold one story per scenario.

## Suites

```bash
pnpm --filter @stint/core test
scripts/ci-db.sh tt_f432 && DATABASE_URL=…/tt_f432 pnpm --filter @stint/web test
pnpm --filter @stint/web test:stories
```
