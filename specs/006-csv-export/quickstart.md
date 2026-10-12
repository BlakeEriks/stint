# Quickstart: Export your records

1. `pnpm --filter @stint/core test`: the CSV text, rates including `0`.
2. `pnpm --filter @stint/web test` against a migrated test database
   (`scripts/ci-db.sh`): both routes.
3. `pnpm test:ui` and `pnpm --filter @stint/web test:stories`: the hook and
   the Settings stories.
4. `pnpm dev`, sign in as the seeded account (`docs/local-dev.md`), open
   Settings, press **Download entries** and **Download invoices**. Each saves
   `stint-<kind>-<today>.csv`; open both in a spreadsheet and check a row
   against its entry and its invoice.
