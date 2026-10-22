# Contract: the invoice document

## GET /api/v1/invoices/:id/pdf

Unchanged when the document opens: `200 application/pdf`, `inline`, or
`attachment` with `?download=1`.

| Case | Answer |
| --- | --- |
| Invoice missing or another user's | `404 ENTRY_NOT_FOUND` (checked first) |
| Billing not configured | `200`, the document |
| Caller's plan is paid | `200`, the document |
| Invoice generated while paying | `200`, the document |
| Otherwise | `402 PAYMENT_REQUIRED`, both dispositions |

```json
{ "code": "PAYMENT_REQUIRED", "message": "Downloading an invoice is on the paid plan. Subscribe in Settings." }
```

## GET /api/v1/invoices/:id

Adds `canDownload: boolean`, the same rule as above.

## Unchanged and free

`POST /invoices/preview`, `POST /invoices`, `PATCH /invoices/:id/status`,
`DELETE /invoices/:id`, `GET /invoices`.
