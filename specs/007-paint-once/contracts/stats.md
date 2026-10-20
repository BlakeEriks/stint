# Contract: `GET /api/v1/stats` week days

Additive: each `week[i]` gains `byClient`. No field is removed or renamed,
so an older macOS build keeps decoding the response.

```json
{
  "week": [
    {
      "date": "2026-10-19",
      "seconds": 27000,
      "amount": "742.50",
      "byClient": { "c1a…": 18000, "c2b…": 7200, "": 1800 }
    }
  ]
}
```

- Billable seconds only; non-billable work counts in `seconds` and not in
  `byClient`.
- `''` holds billable work with no client.
- A running timer counts as it does in `seconds` today.
- The parts add up to the day's `seconds`, within a second for a running
  session, which `revenue_by_day` and `dayByClient` each measure to `now`.
- `GET /api/v1/calendar?granularity=day`, whose only reader was this split,
  is removed.
