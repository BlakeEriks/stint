---
paths:
  - "apps/web/src/app/api/v1/invoices/**"
  - "apps/web/src/lib/invoicing.ts"
  - "packages/core/src/invoice.ts"
  - "packages/core/src/payment.ts"
  - "apps/web/src/lib/invoice-pdf.tsx"
---

## Invoicing

Line-item construction lives in `packages/core/src/invoice.ts` — pure, so the
preview a user approves and the invoice that issues are built by identical
code. Routes in `apps/web/src/app/api/v1/invoices/`; shared loaders in
`apps/web/src/lib/invoicing.ts`, which reads rows through `rows.ts` like
everything else. `formatCurrency` and `formatHours` are in core for the same
reason: the preview and the PDF render one number one way.

**An invalid `tz` is rejected rather than swallowed here.** The period is local
dates, so the zone decides which entries are billed; the read endpoints fall
back to UTC, these two return 422. An omitted one still defaults to UTC.

### Rules that must not regress

- **The rate is always part of the grouping key.** Two entries with the same
  task name but different rates must never merge — the line would misstate
  what the client is charged.
- **Amounts round once, per line, from summed seconds.** Rounding per entry
  then summing drifts (3 × 20min would give 99.99 instead of 100.00).
- **Line items are frozen at generation.** Never recompute a PDF from time
  entries; re-downloading a year later must produce the same document.
- **Only drafts can be sent or deleted.** Sending is an action, not a status
  write — the status change happens after delivery succeeds.
- **Voiding releases entries; it does not remove the number.** Numbering stays
  gapless.
- Running timers, non-billable entries, and already-invoiced entries never
  reach an invoice.

### No email

**The app sends no mail.** Invoices are downloaded and sent by the user from
their own address; `PATCH /invoices/:id/status` records that it went out.
`principles.md` says why, and it is not a gap to fill.

### Payment details

**Bank details render on the invoice PDF, never in an email body**, and the
placement is not a user preference. Rendering identically on every invoice is
what makes a *change* visible, which is what fraud-prevention guidance tells
payers to challenge.

`docs/data-model.md` has the `payment_profiles` shape, the US-first field
order and the resolution chain.

- **Invoices freeze the rendered snapshot** into `payment_details` (JSONB) at
  generation, like rates. Editing a profile never alters an issued invoice.
- `buildPaymentDetails` in `packages/core/src/payment.ts` drops unset fields
  entirely — never render an empty label, and never an empty section header.
- The PDF payment block is `wrap={false}`: a stranded "Payment" header with
  the account numbers overleaf is the one page break that actually harms the
  reader.

### PDF and the test runner

JSX lives only in `invoice-pdf.tsx`; routes import `renderInvoicePdf`
**dynamically** so the handlers stay loadable by the type-stripping test
runner. `test/loader.mjs` transforms `.tsx` through the SWC binary Next ships.

Route tests run with `--test-concurrency=1`: the test files share one database
and truncate tables in `beforeEach`, so parallel files clobber each other.

### RLS

`pnpm test:rls` is a **separate script against a separate database**, because
the route tests disable RLS on theirs. It connects as a non-superuser
`authenticated` role and sets `request.jwt.claim.sub` per transaction the way
PostgREST does, so `auth.uid()` resolves and the policies actually run.

Its `before` hook asserts the role is neither a superuser nor `BYPASSRLS` —
without that, every assertion would pass vacuously and the suite would be
decorative. Do not add `rls.test.ts` to the `test` glob: pointed at the
RLS-disabled database it would pass while proving nothing.
