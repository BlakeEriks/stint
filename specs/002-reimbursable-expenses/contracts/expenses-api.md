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
  "projectId": "uuid | null",
  "spentOn": "YYYY-MM-DD",
  "description": "string",
  "amount": 199.00,
  "note": "string | null",
  "invoiceId": "uuid | null",
  "recurringExpenseId": "uuid | null"
}
```

## Expenses

| Method | Path | Notes |
|---|---|---|
| `GET` | `/expenses` | `?tz` (required) `&clientId&status=unbilled\|all` (default `unbilled`). Runs `produce_recurring_expenses` through today in `tz` first. Returns `{ expenses: Expense[] }`, oldest `spentOn` first. |
| `POST` | `/expenses` | `{ id, clientId, projectId?, spentOn, description, amount, note? }`. `id` is UUIDv7, so a retry returns the existing row. `201`. `422 VALIDATION_FAILED` for a zero or negative amount, a blank description, or a project not under `clientId`. |
| `PATCH` | `/expenses/:id` | Any field from `POST` except `id`. `409 EXPENSE_LOCKED` when the expense is on a non-draft invoice. |
| `DELETE` | `/expenses/:id` | `204`. `409 EXPENSE_LOCKED` under the same condition. |

A missing or foreign id returns `404 ENTRY_NOT_FOUND`, as the invoice routes
do.

## Recurring expenses

| Method | Path | Notes |
|---|---|---|
| `GET` | `/recurring-expenses` | `?clientId`. Live ones first, then stopped. |
| `POST` | `/recurring-expenses` | `{ id, clientId, projectId?, startsOn, description, amount, note? }`. `201`. |
| `PATCH` | `/recurring-expenses/:id` | `{ description?, amount?, projectId?, note?, startsOn?, stop? }`. The changes apply to months not yet produced. `startsOn` after the first production returns `422 VALIDATION_FAILED`. `stop: true` produces through today, then sets `stopped_on` to today. That requires `tz`. A stopped recurrence returns `422` for any edit. |

## Invoices (changed)

`POST /invoices/preview` and `POST /invoices` take
`excludedExpenseIds: uuid[]` (default `[]`, maximum 200). The server bills
every unbilled expense for the client with `spentOn <= periodEnd` that is
not in that list.

Response additions:

```jsonc
{
  "lineItems": [
    // service lines as today, then:
    { "description": "Claude Max", "unit": "expense", "quantity": 1,
      "unitPrice": 200.00, "amount": 200.00, "spentOn": "2026-09-05",
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
- `409 EXPENSE_ALREADY_INVOICED` when another invoice took an expense between
  the load and the attach. Nothing is written.
- `GET /invoices/:id` returns `spentOn` on expense lines and
  `expensesSubtotal` on the invoice.
- `PATCH /invoices/:id/status` to `void`, and `DELETE /invoices/:id` on a
  draft, release expenses as well as entries.

## `errors.ts`

Add `EXPENSE_LOCKED` and `EXPENSE_ALREADY_INVOICED` to the code union.
