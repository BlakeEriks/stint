# Contract: `GET /api/v1/stats`

`attention` gains `unbilledDue`, an array, empty when no client is ready:

```json
"unbilledDue": [
  {
    "clientId": "…",
    "clientName": "Northwind Trading",
    "seconds": 50400,
    "periodStart": "2026-10-01",
    "periodEnd": "2026-10-31"
  }
]
```

# Contract: `/invoices/new`

`?client=<uuid>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` fills in the client and
dates. Any of them missing or invalid leaves the form as it opens without
them.
