# Quickstart: Payment terms are a number of days

1. Settings → Payment terms: set 45, save, reload: 45 days.
2. A client's dialog: set 15, save. New invoice for it: due date is issue + 15, preview reads "Net 15". Another client: issue + 45.
3. Pick a due date 20 days out: preview reads "Net 20". Pick one before the issue date: a message under Due, Generate disabled.
4. Notice: `update user_settings set payment_terms_days = 30, legacy_payment_terms = 'Payment by check, thanks'` on the local DB; Home's inbox shows it; Save clears it.
5. Tests: `pnpm --filter @stint/core test`, the invoices and routes suites against a private DB, `npx vitest run --project stories -t "<story>"`.
