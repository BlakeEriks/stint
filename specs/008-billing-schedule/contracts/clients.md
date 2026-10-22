# Contract: `billingSchedule` on `/clients`

`Client` gains:

```ts
billingSchedule:
  | null
  | { period: 'semimonthly' | 'monthly' }
  | { period: 'weekly' | 'biweekly'; anchor: string /* YYYY-MM-DD */ }
```

| Request | Result |
| --- | --- |
| `GET /clients`, `GET /clients/:id` | Every client carries `billingSchedule`; `null` when unset. |
| `POST /clients` without it | `billingSchedule: null`. |
| `POST`/`PATCH` with a schedule | Stored and returned as sent. |
| `PATCH` without it | The schedule is unchanged. |
| `PATCH { billingSchedule: null }` | The schedule is cleared. |
| `{ period: 'weekly' }` with no anchor, or an unknown period | `422 VALIDATION_FAILED`. |
| `{ period: 'monthly', anchor }` | `422 VALIDATION_FAILED`: an anchor means nothing there. |
