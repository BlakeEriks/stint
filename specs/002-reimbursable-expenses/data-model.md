# Data model: Reimbursable expenses

One migration, `00000000000025_expenses.sql` (`research.md` R11). Every change
is additive to production (Principle IX). `research.md` gives the reasons.
This file gives the shapes.

## `expenses` (new)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` pk | Client-generated UUIDv7, so a retried `POST` is idempotent |
| `user_id` | `uuid not null` | → `auth.users` on delete cascade |
| `client_id` | `uuid not null` | → `clients (id, user_id)`: same owner. The migration adds `clients_id_user_idx`, the unique key that foreign key needs. |
| `recurring` | `boolean not null default false` | Billed on every invoice for the client (R5) |
| `spent_on` | `date null` | Set exactly when not recurring |
| `description` | `text not null` | Non-blank, 200 characters or fewer, matching a charge |
| `amount` | `numeric(12,2) not null` | `> 0` |
| `note` | `text null` | 500 characters or fewer. Never printed on the invoice. |
| `invoice_id` | `uuid null` | → `invoices` on delete set null. Set means billed. Always null when recurring. |
| `created_at`, `updated_at` | `timestamptz` | `touch_updated_at` trigger |

- check `expense_dated`: `recurring = (spent_on is null)`
- check `recurring_never_billed`: `not recurring or invoice_id is null`
- index: `(user_id, client_id) where invoice_id is null`, the path every
  preview and the card read
- trigger `guard_billed_expense` (update and delete, `research.md` R8)
- RLS: `user_id = auth.uid()`, plus the explicit grant to `authenticated`
  (`00000000000004_api_grants.sql` pattern)

The amount is in the client's currency. There is no currency column, because
an expense is billed in its client's currency and never converted.

**Lifecycle, one-off**: unbilled → on a draft (editable) → on an issued
invoice (locked) → released by void or by deleting the draft → unbilled
again. Off the client's card once its invoice is paid (R7).

**Lifecycle, recurring**: live until deleted. Never attached, so never locked
or released. Each invoice holds its own frozen line.

## `invoice_line_items` (changed)

- `unit` check widens to `('hour', 'fixed', 'expense')`.
- New `spent_on date null`.
- `expense_line_is_one`: `unit <> 'expense' or quantity = 1`
- `expense_line_has_date`: `(unit = 'expense') = (spent_on is not null)`

## `invoices` (changed)

- New `expenses_subtotal numeric(12,2) not null default 0 check (>= 0)`.
- `subtotal` is the services subtotal and the taxed base, as before.
- `total = subtotal + tax_amount + expenses_subtotal`, written by
  `POST /invoices` from `buildLineItems`.

## Function

`create_invoice(p_user_id uuid, p_invoice jsonb, p_entry_ids uuid[],
p_expense_ids uuid[]) returns invoices` writes a computed invoice in one
transaction and raises when a one-off was already claimed, so no number is
used without an invoice (R9). `security invoker`, `set search_path = public,
pg_temp`, and `grant execute` to `authenticated`, so it passes
`verify:schema` (Principle II).

## Unchanged, on purpose

`unbilled_by_client`, `month_revenue`, `revenue_by_*` and the rate functions
read `time_entries` only, so expenses stay out of Earned and Unbilled
(FR-015). `collected_by_month` and awaiting payment read `invoices.total`,
which includes expenses (FR-016).
