# Contract: `GET /api/v1/stats`

`attention` gains `unbilledDue`, an array, empty when nothing is due:

```json
"unbilledDue": [
  {
    "clientId": "…",
    "clientName": "Northwind Trading",
    "entryIds": ["…", "…"],
    "seconds": 50400,
    "since": "2026-08-03",
    "periodStart": "2026-08-01",
    "periodEnd": "2026-09-30",
    "onePeriod": false
  }
]
```

# Contract: `/invoices/new`

`?client=<uuid>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` fills in the client and
dates. Any of them missing or invalid leaves the form as it opens without
them.

Billed elsewhere uses the existing `POST /entries/invoiced-elsewhere` with
`{ ids: entryIds, invoicedElsewhere: true }`.
