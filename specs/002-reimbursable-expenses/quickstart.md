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
tax on expenses, ordering), the UI suite and the stories, one per acceptance
scenario. `verify:db` runs `invoices.test.ts` (the invoice with expenses,
recurring billed twice, the lock, void release, the double-attach conflict),
`rls.test.ts` and `verify:schema`.

## By hand, in the browser

1. **Record** (User Story 2). On Clients, press **+ Expense** on a client's
   card: 12 Sep, "JetBrains license", $249. It shows under Expenses. Click
   the row and change it to $199.
2. **Bill** (User Story 1). New invoice for that client, 1–30 Sep. The
   expense is ticked under Expenses. Preview: the Preview card shows the
   service lines, then Expenses with "JetBrains license · Sep 12 · $199.00",
   then Services, Expenses and Total. Generate, then open the PDF: the same
   sections.
3. **Lock** (User Story 3). Mark the invoice sent. On the card the expense is
   muted with the invoice number, and clicking it opens the invoice. Void the
   invoice: the expense is unbilled again and opens its dialog.
4. **Leave one off.** Add a second expense and untick it. The preview clears.
   Generate: the unticked one still waits on the card.
5. **Earlier month.** An expense dated 20 Aug joins a September invoice.
6. **Recurring** (User Story 4). Add "Claude Max subscription", $200, and
   check Recurring: the date field hides and the row shows ↻ Recurring.
   Generate September: its line is dated Sep 30. Start another invoice for
   the client: it is ticked again. Delete it: the next invoice does not offer
   it, and September's keeps its line.
7. **Paid.** Mark the invoice from step 2 paid: the expense leaves the card.
8. **Clients.** No Active / Archived / All filter; an archived project shows
   with its badge.
9. **Home.** Earned and Unbilled are unchanged by any expense.
