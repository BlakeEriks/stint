# Quickstart: validate the leave guard

Signed in to local Stint as `builder@localhost.test`, seeded with
`pnpm seed builder@localhost.test`.

1. Open New invoice, press Calendar: it leaves without asking.
2. Open New invoice, pick a client, press Calendar: the dialog asks. Keep
   editing keeps the form; Discard goes to Calendar.
3. Pick a client, type a reference, press Calendar, press Save draft: Calendar
   opens, and the draft in Invoices keeps the reference.
4. Pick a client, refresh: the browser prompts.
5. Pick a client with no unbilled work in the period, press Generate
   invoice: a draft with nothing to bill opens; Mark sent refuses it.

Checks: `pnpm verify:static`, `TT=tt_583 pnpm db:setup && TT=tt_583 pnpm verify:db`.
