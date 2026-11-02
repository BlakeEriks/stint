# API changes

- `GET/PATCH /api/v1/settings`: `billingTimeZone: string | null`. PATCH refuses a non-IANA zone with `422 VALIDATION_FAILED`.
- `POST /api/v1/invoices/preview`, `POST /api/v1/invoices` and `PATCH /api/v1/invoices/:id`: `tz` is now the device's zone, used only when the account has none. The period, issue date and due date are read in the resolved zone, which a new draft stores as its `tz`.
