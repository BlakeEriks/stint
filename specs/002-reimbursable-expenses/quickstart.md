# Quickstart: validating reimbursable expenses

## Prerequisites

In `../stint-f48-expenses`: `pnpm dev:up`, then the dev server
(`docs/local-dev.md`). Sign in to the seeded account through Mailpit. The
account needs one client with a rate and some billable September time.

## Automated

```bash
pnpm verify:static
```

```bash
pnpm verify:db
```

`verify:static` runs `packages/core/test/invoice.test.ts` (split totals, no
tax on expenses, ordering) and the UI suite (`invoice-new`, `invoice-detail`,
the Expenses tab). `verify:db` runs `invoices.test.ts` (the invoice with
expenses, the lock, void release, the double-attach conflict, recurrence
production), `rls.test.ts` (both new tables isolate) and `verify:schema`
(RLS, grants, and the function grant).

## By hand, in the browser

1. **Record** (User Story 2). Go to Invoices, then Expenses, then Add
   expense: the client, 12 Sep, "JetBrains license", $249. It is listed as
   unbilled. Edit it to $199.
2. **Bill** (User Story 1). Go to New invoice with that client and period
   1–30 Sep. The preview shows the service lines and their subtotal, then an
   Expenses heading with "12 Sep · JetBrains license · $199.00" and its own
   subtotal. The total is both. Generate, then download the PDF: it has the
   same sections.
3. **Lock** (User Story 3). Mark the invoice sent. Editing or deleting the
   expense from the Expenses tab (with the All filter) is refused. Void the
   invoice: the expense is unbilled again and editable.
4. **Leave one off.** Add a second expense and exclude it in the preview.
   The approval clears. Generate: the excluded one is still unbilled.
5. **Earlier month.** Add an expense dated 20 Aug. A September invoice picks
   it up.
6. **Recurring** (User Story 4). Add a recurring expense starting 5 Aug,
   "Claude Max", $200. The Expenses tab shows 5 Aug and 5 Sep. Delete the
   5 Aug one and reload: it does not come back. Stop the recurrence: nothing
   more is produced.
7. **Home.** Earned and Unbilled are unchanged by any expense.
