# Contract change

`POST /invoices` and `PATCH /invoices/:id` no longer return
`400 INVALID_PERIOD` when there is nothing to bill. They create or save a
draft with no lines. `PATCH /invoices/:id/status` to `sent` still returns
`422 VALIDATION_FAILED` for a draft with no lines.
