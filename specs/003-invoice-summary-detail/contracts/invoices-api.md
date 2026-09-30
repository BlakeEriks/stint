# Contract: `/api/v1/invoices`, changed

Only the changes are listed. The rest of each route is in `docs/api.md`, which
each story's PR updates. Every field is added, and no field is removed or
renamed, so an older client keeps working.

## `POST /invoices/preview`

**No side effects**, as before.

Request, added:

| Field | Type | Notes |
| --- | --- | --- |
| `groupingMode` | adds `'summary'` | |
| `summaryText` | `string`, ≤ 200, default `''` | The line text with `'summary'`. Ignored by the other modes. |

Response, added:

| Field | Type | Notes |
| --- | --- | --- |
| `schedules` | `Schedules \| null` | With `'summary'`, all three tables and `totalHours`, from the entries the lines bill (`data-model.md`). The card shows the ticked ones. `null` for the other modes. |

With `'summary'`, `lineItems` has one `hour` line per distinct rate, each with
`description = summaryText`.

## `POST /invoices`

Request, added:

| Field | Type | Notes |
| --- | --- | --- |
| `summaryText` | `string` | Required, non-empty, with `'summary'`. |
| `schedules` | `('project' \| 'week' \| 'date')[]` | Unique. Allowed only with `'summary'`. The route computes the tables with `tz` and freezes them in `supporting_detail`, in print order. |
| `tz` | IANA zone | Required with `schedules`; the zone weeks and dates are bucketed in. |
| `reference` | `string`, ≤ 200, optional | Blank becomes null. |
| `paymentProfileId` | `uuid`, optional | The profile to freeze. When absent, the client's profile, else the default, as today. |
| `issueDate` | already accepted | New invoice now sends the local date. |

Errors, added:

- `422 VALIDATION_FAILED`: `'summary'` with an empty `summaryText`;
  `schedules` with another mode; `paymentProfileId` archived or not found.

Response: the `Invoice` below, plus `lineItems` and `entryCount` as today.

## `Invoice` (every route that returns one)

Added: `summaryText: string | null`, `reference: string | null`,
`supportingDetail: Schedules | null` (only the ticked tables). `groupingMode` adds `'summary'`.

## `GET /invoices/:id/pdf`

- Page 1: "Service period" replaces "Period", with "Reference" beneath it when
  one is set.
- When `supporting_detail` is set, its tables follow from page 2, in the order project, week, date. Each
  detail page carries the running header "Supporting detail · {number} ·
  {client} · {period}". A table that runs over a page repeats its heading
  with "(continued)" and its column headings. Every table ends in a Total row.
  Tables show hours only.
- The detail is read from `supporting_detail`, frozen at generation
  (`research.md` R4).

## UI contract: New invoice

The screen's states are the stories in `invoice-new.stories.tsx`, one for
each state in the spec's Design section and each acceptance scenario:
Client chosen, No client yet, Updating, No summary line, New payment details,
Editing an expense and New charge, each on Desktop and Phone. The Design
section and `design/new-invoice.html` are the reference for each.
