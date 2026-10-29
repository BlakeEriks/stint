# API: Invoice templates

**`GET /api/v1/settings`** adds `invoiceTemplate: InvoiceTemplate`
(`'standard'` until chosen).

**`PATCH /api/v1/settings`** accepts `invoiceTemplate`. Any other string is
`400 VALIDATION_FAILED`, naming the field.

**`GET /api/v1/invoices/:id`** and the list add `template: InvoiceTemplate |
null`: null while a draft, frozen once sent.

**`GET /api/v1/invoices/:id/pdf`** renders in `template`, or for a draft in
the setting at the time of the request, and records that template in the
draft's download snapshot.

**`POST /api/v1/invoices/:id/status`** (Mark sent) freezes `template` as the
download snapshot's, else the setting's. No new error.
