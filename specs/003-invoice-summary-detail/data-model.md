# Data model: Invoice summary with supporting detail

One migration, `supabase/migrations/00000000000028_invoice_summary.sql`
(`research.md` R2). No new table, so `rls.test.ts` and `verify-schema.mjs`
need no new table. `own_invoices` already covers the new columns.

## `invoices`, widened

| Column | Type | Rule |
| --- | --- | --- |
| `grouping_mode` | `text` | Check widened to `('summary','entry','task','project','day')`. |
| `summary_text` | `text` | `(grouping_mode = 'summary') = (summary_text is not null)`; `btrim(summary_text) <> ''` and at most 200 characters, the limit on a line description. |
| `reference` | `text` | Null when blank; `btrim(reference) <> ''` and at most 200 characters. |
| `schedules` | `text[] not null default '{}'` | `schedules <@ '{project,week,date}'`; `grouping_mode = 'summary' or schedules = '{}'`. Stored in print order: project, week, date. |
| `tz` | `text` | The IANA zone the period was resolved in. `schedules = '{}' or tz is not null`. Null on invoices issued before this migration. |

Every existing row satisfies every check: its mode is one of the old four,
`summary_text` is null and `schedules` is empty.

The payment profile the user chose needs no column. `payment_details`
already freezes the rendered block (R8).

## `create_invoice(p_user_id, p_invoice, p_entry_ids, p_expense_ids)`

Replaced with the same signature. The insert also writes
`p_invoice->>'summary_text'`, `p_invoice->>'reference'`, `p_invoice->>'tz'` and
`schedules` from `p_invoice->'schedules'` (a JSON array, read with
`jsonb_array_elements_text`). The number, lines, entry and expense claims and
payment reference are unchanged.

## Derived, never stored: a schedule

`buildSchedules` in `packages/core/src/schedule.ts` works from the entries the
invoice bills (`time_entries.invoice_id = invoice.id`), their projects' names,
`invoices.tz` and the period (R4).

```ts
interface ScheduleEntry { startedAt: string; durationSeconds: number; projectName: string | null }

interface Schedules {
  project: Array<{ project: string; hours: number }>;
  week:    Array<{ start: string; end: string; hours: number }>;   // ISO dates, clipped to the period
  date:    Array<{ date: string; project: string; hours: number }>;
  totalHours: number;
}
```

`paginateSchedules(chosen, rowsPerPage)` turns the chosen tables into detail
pages. Each page lists `{ kind, continued, rows }` blocks (R5).

## Validation (`@stint/schema`)

- `GroupingMode`: `'summary' | 'entry' | 'task' | 'project' | 'day'`.
- `InvoicePreviewRequest.summaryText`: trimmed, at most 200 characters, default
  `''`. An empty text previews its line blank.
- `CreateInvoice`: `summaryText` is required and non-empty when
  `groupingMode = 'summary'`. `schedules` is a unique subset of
  `project | week | date`, allowed only with `'summary'`. `reference` is
  optional, trimmed, at most 200 characters, and blank becomes null.
  `paymentProfileId` is an optional uuid. A breach is `422 VALIDATION_FAILED`.
- `Invoice` gains `summaryText`, `reference` and `schedules`.

## State

No new transitions. A generated invoice is a draft, and the columns above are
written once, by `create_invoice`. No route updates them afterwards. Voiding
releases the entries, which empties a derived schedule (R4, known limits).
