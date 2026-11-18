# Contract: `POST /api/v1/invoices/preview`

The answer gains `heldWork`, null when there is none:

```json
"heldWork": {
  "entryCount": 6,
  "drafts": [
    { "id": "…", "invoiceNumber": "INV-0012", "entryCount": 6 }
  ]
}
```
