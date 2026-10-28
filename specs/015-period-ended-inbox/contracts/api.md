# Contract: `GET /api/v1/stats`

`attention` gains `periodsDue`, an array, empty when nothing is due:

```json
"periodsDue": [
  {
    "clientId": "…",
    "clientName": "Northwind Trading",
    "periodStart": "2026-09-01",
    "periodEnd": "2026-09-30",
    "seconds": 54000
  }
]
```

# Contract: `/invoices/new`

`?client=<uuid>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` fills in the client and
period. Any of them missing or invalid leaves the form as it opens without
them.
