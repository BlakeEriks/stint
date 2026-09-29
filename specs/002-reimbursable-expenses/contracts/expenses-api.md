# Contract: expenses in `/api/v1`

Route Handlers under the existing conventions: `requireSession()`, then
`handle()` with `ApiError`, and no Server Actions (Principle III). Request
schemas live in `packages/schema/src/index.ts`. Money is a number with two
decimal places, as `money` is everywhere else.

`Expense`:

```jsonc
{
  "id": "uuid",
  "clientId": "uuid",
  "recurring": false,
  "spentOn": "YYYY-MM-DD | null",   // null exactly when recurring
  "description": "string",
  "amount": 199.00,
  "note": "string | null",
  "invoice": { "id": "uuid", "number": "STINT-0013", "status": "sent" } // or null
}
```

## Expenses

| Method | Path | Notes |
|---|---|---|
| `GET` | `/expenses` | `?clientId&status=open\|unbilled` (default `open`). `open` is recurring, unbilled, and on a draft or sent invoice (`research.md` R7). `unbilled` is recurring and unbilled. Returns `{ expenses: Expense[] }`: recurring first, then by `spentOn`. |
| `POST` | `/expenses` | `{ id, clientId, recurring, spentOn?, description, amount, note? }`. `spentOn` is required unless `recurring`, and refused with it. `id` is UUIDv7, so a retry returns the existing row. `201`. `422 VALIDATION_FAILED` for a zero or negative amount, a blank description, or a date that disagrees with `recurring`. |
| `PATCH` | `/expenses/:id` | Any field from `POST` except `id` and `clientId`. Setting `recurring: true` clears `spentOn`; `false` requires one. `409 EXPENSE_LOCKED` when the expense is on a non-draft invoice. `422` for `recurring: true` on a billed one. |
| `DELETE` | `/expenses/:id` | `204`. `409 EXPENSE_LOCKED` under the same condition. |

A missing or foreign id returns `404 ENTRY_NOT_FOUND`, as the invoice routes
do. The `/recurring-expenses` routes are removed.

## Invoices (changed)

`POST /invoices/preview` and `POST /invoices` take
`excludedExpenseIds: uuid[]` (default `[]`, maximum 200). The server bills
every recurring expense for the client and every unbilled one-off with
`spentOn <= periodEnd`, less that list. A recurring expense's line is dated
`periodEnd`.

Response additions:

```jsonc
{
  "lineItems": [
    // service lines as today, then:
    { "description": "Claude Max subscription", "unit": "expense", "quantity": 1,
      "unitPrice": 200.00, "amount": 200.00, "spentOn": "2026-09-30",
      "rateSource": "manual", "entryIds": [], "expenseId": "uuid" }
  ],
  "subtotal": 1462.50,          // services, the taxed base
  "taxAmount": 0,
  "expensesSubtotal": 200.00,
  "total": 1662.50
}
```

- A period with no unbilled time and no charges, but one expense, generates.
  The `INVALID_PERIOD` "Nothing to invoice" check counts expense lines.
- `409 EXPENSE_ALREADY_INVOICED` when another invoice took a one-off between
  the load and the attach. Nothing is written, and no number is used.
- `GET /invoices/:id` returns `spentOn` on expense lines and
  `expensesSubtotal` on the invoice.
- `PATCH /invoices/:id/status` to `void`, and `DELETE /invoices/:id` on a
  draft, release one-offs as well as entries.

## `errors.ts`

`EXPENSE_LOCKED` and `EXPENSE_ALREADY_INVOICED` in the code union.
