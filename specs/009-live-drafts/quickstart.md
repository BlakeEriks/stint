# Quickstart: Drafts collect their period's work until sent

## Local

1. Generate an invoice for Northwind for the current half-month.
2. Log an entry inside that period: the draft's lines and total include it on reopen.
3. Download the PDF, log another entry, reopen: the banner shows the change and Mark sent is disabled; download again and Mark sent works.
4. Log an entry inside the sent period: Home's inbox lists it as late.
5. Start New invoice for Northwind over an overlapping period: the line links to the draft and Generate is disabled.

## Suites

```bash
pnpm --filter @stint/core test
PGPORT=54322 bash scripts/ci-db.sh tt_f433 && DATABASE_URL=…/tt_f433 pnpm --filter @stint/web test
PGPORT=54322 bash scripts/ci-db.sh tt_f433_rls --rls && … pnpm --filter @stint/web test:rls
pnpm --filter @stint/web test:stories
```
