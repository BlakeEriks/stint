# Data model: Reimbursable expenses

Two migrations: `00000000000023_expenses.sql` for one-off expenses and
`00000000000024_recurring_expenses.sql` for recurrences, so the second can
merge after the first (`research.md` R12). Migration 24 also adds
`recurring_expense_id` and `recurrence_month` to `expenses`. Every change is
additive (Principle IX). `research.md` gives the reasons. This file gives the
shapes.

## `expenses` (new)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` pk | Client-generated UUIDv7 on `POST`, so a retry is idempotent. Default `gen_random_uuid()` for produced rows. |
| `user_id` | `uuid not null` | → `auth.users` on delete cascade |
| `client_id` | `uuid not null` | → `clients (id, user_id)`: same owner. The migration adds `clients_id_user_idx`, the unique key that foreign key needs, the way `projects_id_user_idx` exists for entries. |
| `project_id` | `uuid null` | → `projects (id, user_id)`, `on delete set null (project_id)`. Must belong to `client_id` (trigger). |
| `spent_on` | `date not null` | |
| `description` | `text not null` | Non-blank, 200 characters or fewer, matching a charge |
| `amount` | `numeric(12,2) not null` | `> 0` |
| `note` | `text null` | 500 characters or fewer. Never printed on the invoice. |
| `invoice_id` | `uuid null` | → `invoices` on delete set null. Set means billed. |
| `recurring_expense_id` | `uuid null` | → `recurring_expenses` on delete restrict |
| `recurrence_month` | `date null` | First of the month the recurrence produced it for |
| `created_at`, `updated_at` | `timestamptz` | `touch_updated_at` trigger |

- `unique (recurring_expense_id, recurrence_month)`
- check: `(recurring_expense_id is null) = (recurrence_month is null)`, the
  repo's paired-nullability pattern
- index: `(user_id, client_id, spent_on) where invoice_id is null`, the
  unbilled path
- triggers: `guard_billed_expense` (update and delete, `research.md` R8) and
  the project-belongs-to-client check (R11)
- RLS: `user_id = auth.uid()`, plus the explicit grant to `authenticated`
  (`00000000000004_api_grants.sql` pattern)

The amount is in the client's currency. The table has no currency column,
because an expense is billed in its client's currency and never converted.

**Lifecycle**: unbilled (`invoice_id` null) → on a draft (editable) → on an
issued invoice (locked) → released by void or by deleting the draft →
unbilled again.

## `recurring_expenses` (new)

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` pk | Client-generated UUIDv7 |
| `user_id` | `uuid not null` | → `auth.users` on delete cascade |
| `client_id` | `uuid not null` | → `clients (id, user_id)` |
| `project_id` | `uuid null` | as on `expenses` |
| `description`, `amount`, `note` | | as on `expenses` |
| `starts_on` | `date not null` | Anchors the day of the month. Cannot be edited once `produced_through` is set. |
| `stopped_on` | `date null` | Set means stopped. Nothing after it is produced. |
| `produced_through` | `date null` | First of the last month produced: the watermark (R6) |
| `created_at`, `updated_at` | `timestamptz` | |

RLS, grant, and the ownership and project checks match `expenses`. There is
no delete route: a recurrence is stopped. Produced expenses reference it.

**Lifecycle**: live → stopped. Stopping is one-way. To resume, create a new
recurrence.

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

`produce_recurring_expenses(p_user_id uuid, p_through date) returns void` is
`security invoker` with `set search_path = public, pg_temp`, and has
`grant execute` to `authenticated`, so it passes `verify:schema`
(Principle II). R5 has the algorithm.

## Unchanged, on purpose

`unbilled_by_client`, `month_revenue`, `revenue_by_*` and the rate functions
read `time_entries` only, so expenses stay out of Earned and Unbilled
(FR-015). `collected_by_month` and awaiting payment read `invoices.total`,
which now includes expenses (FR-016).
