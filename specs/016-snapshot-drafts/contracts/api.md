# API changes

| Endpoint | Change |
| --- | --- |
| `GET /invoices/:id` | Drops `changedSinceDownload` and each line's `isNew`. A draft adds `entryCount` and `newWork`: `{ entries, expenses, hours, amount }`, or null when there is none. |
| `POST /invoices/:id/work` | New. Holds the draft's new work. `204`. `409 INVOICE_STATUS_CHANGED` once it isn't a draft, `404` when gone. |
| `POST /invoices`, `PATCH /invoices/:id` | Never `409 DRAFT_OVERLAPS`. Hold what they build. |
| `PATCH /invoices/:id/status` | Never `409 DRAFT_CHANGED`. Sends the held work. |
| `POST /invoices/preview` | Prices a build: with `draftId`, that draft's held work counts as available. |
| `POST /entries/invoiced-elsewhere` | Removed. One entry's mark stays on `PATCH /entries/:id`. |
