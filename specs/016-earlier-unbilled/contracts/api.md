# Contract: `POST /api/v1/invoices/preview`

The answer gains `earlierWork`, null when there is none:

```json
"earlierWork": {
  "entryCount": 1,
  "from": "2026-09-30",
  "to": "2026-09-30",
  "draft": null
}
```

`draft` is `{ "id": "…", "invoiceNumber": "INV-0042" }` when another draft holds all of it.
