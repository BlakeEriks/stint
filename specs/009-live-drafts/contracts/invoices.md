# Contract: live drafts

| Request | Change |
| --- | --- |
| `GET /invoices?tz` | Drafts in the result are refreshed first; their `total` is current. |
| `GET /invoices/:id?tz` | A draft is refreshed first. Adds `changedSinceDownload: { hours: { from, to }, total: { from, to } } \| null`; each line item adds `isNew: boolean` (always false off a draft). |
| `GET /invoices/:id/pdf?tz` | A draft is refreshed, rendered, and its `downloaded_snapshot` recorded. |
| `POST /invoices` | Stores `tz` and `excludedExpenseIds`. `409 DRAFT_OVERLAPS` `{ invoiceId, invoiceNumber, periodStart, periodEnd }` when an open draft for the client overlaps the period. |
| `PATCH /invoices/:id/status { status: 'sent' }` on a draft | Refreshes and sends in one transaction. `409 DRAFT_CHANGED` `{ hours: { from, to }, total: { from, to } }` when it changed since its last render; `400 NO_RATE_CONFIGURED` when an entry has no rate. |
| `GET /stats` | `attention.lateEntries: [{ entryId, taskName, startedAt, hours, clientId, clientName, invoiceId, invoiceNumber, periodStart, periodEnd }]`, oldest first. |
