# Contract: `/api/v1/settings` and `/api/v1/stats`

## `GET /settings`, `PATCH /settings`

One new field:

```json
{ "projectionDays": "every_day" | "weekdays" | "weekdays_except_holidays" }
```

`GET` returns it, `weekdays` until set. `PATCH` accepts it; any other value
is `422 VALIDATION_FAILED` and changes nothing.

## `GET /stats`

No new field. `month.series`, `month.projected`, `month.projection`,
`month.businessDaysElapsed` and `month.businessDaysTotal` count days under
the caller's `projectionDays`.
