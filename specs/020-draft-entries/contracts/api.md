# Contract: GET /api/v1/invoices/:id

Adds one field:

`entries`: `InvoiceEntry[]`, oldest first. A draft's carry `amount`; an
issued invoice's don't. A void invoice holds none.

```json
{
  "entries": [
    {
      "id": "…", "projectId": "…", "projectName": "Brand site",
      "taskName": "Type scale", "startedAt": "2026-09-10T09:00:00Z",
      "endedAt": "2026-09-10T11:00:00Z", "durationSeconds": 7200,
      "isBillable": true, "rateOverride": null, "invoiceId": null,
      "durationOk": false, "invoicedElsewhere": false, "amount": 300
    }
  ]
}
```
