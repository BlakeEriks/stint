# Quickstart: validating the invoice summary

## Prerequisites

In `../stint-f188-invoice-summary`: `pnpm dev:up`, `pnpm dev:migrate`, then
the dev server (`docs/local-dev.md`). Sign in to the seeded account through
Mailpit. The seeded account needs one client with September time on two
projects, at two rates, and one recurring and one one-off expense.

## Automated

```bash
pnpm verify:static
pnpm verify:db
```

`verify:static` runs `packages/core/test/invoice.test.ts` (summary lines per
rate), `schedule.test.ts` (buckets, week clipping, Unassigned, the midnight
entry, rounding, pagination and "(continued)"), the UI suite and the stories.
`verify:db` runs `invoices.test.ts` (summary validation, stored choice,
schedules derived identically on every download, the chosen payment profile
frozen, reference), `mocks-parity.test.ts` (the fake preview's `schedules`)
and `verify:schema`.

## By hand, in the browser

Each step names the story it proves.

1. **Summary** (US1). New invoice, the client, 1–30 Sep. Under Show time as,
   pick One summary line: the Summary line field says "Give the summary line
   its text." and Generate is disabled. Type "Software consulting services":
   there are two lines, one per rate, with that text.
2. **Live** (US3). Each change to the grouping, the text, an expense tick or a
   charge shows **Updating…** with the figures dimmed, then the answer. The
   card shows the business block, the next number, today, Bill to and
   Payment details. Narrow the window below 900px: the card moves under the
   form.
3. **Reference** (US4). Type "ICA dated Aug 5, 2026 · Exhibit A SOW": it shows
   under Service period at once. Clear it: the row goes.
4. **Expenses, charges, payment** (US5). Press an expense's name: its dialog
   opens. "+ Add a charge", $400: it is a row and a line. Open it and press
   Remove. From the picker, "+ New payment details", then save: it is
   selected.
5. **Schedules** (US2). Tick Hours by project and Hours by date: the card
   shows "Page 2 · supporting detail" at once. Generate and open the PDF.
   Page 1 is the invoice only. Page 2 opens with Hours by project, each detail
   page has the running header, and a long Hours by date continues with
   "(continued)". The total matches the invoice with nothing ticked.
6. **Frozen**. Download the PDF again: it is identical. The detail screen
   names the attached schedules and prints the chosen payment profile.
7. **SC-001**. Rebuild invoice 2026-001 to SystemSphere: one services line,
   one expense, the reference, and all three schedules.
