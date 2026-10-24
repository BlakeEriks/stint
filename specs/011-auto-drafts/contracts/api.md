# API changes

- `Invoice`: `invoiceNumber`, `sequenceNo` nullable on a draft not yet rendered, whose `issueDate`, `dueDate` and `paymentTerms` are what it would take today.
- `GET /invoices/:id/pdf`: numbers an unnumbered draft first.
- `PATCH /invoices/:id/status` to `sent`: `409 DRAFT_NOT_DOWNLOADED` for an unnumbered draft.
- `POST /invoices`: no number, issue date or terms on the result; `dueDate` kept only when given.
- `GET|PATCH /settings`: `timeZone`, `autoDrafts`, `readyEmail`.
- `GET /stats`: `staleDrafts[].invoiceNumber` nullable; `attention.autoDraftsBlocked`: the job is on, a client is scheduled, and there's no business name or email.
- `GET /api/v1/cron/drafts`: `Authorization: Bearer $CRON_SECRET`, else 401; returns `{ created, emailed }`.
