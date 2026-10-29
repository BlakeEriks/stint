# API changes

- `GET/PATCH /api/v1/settings`: `billingTimeZone: string | null`. PATCH refuses a non-IANA zone with `422 VALIDATION_FAILED`.
- `GET/POST/PATCH /api/v1/clients[/:id]`: `billingTimeZone?: string | null`; null follows the account's. Same refusal.
- `POST /api/v1/invoices/preview` and `POST /api/v1/invoices`: `tz` is now the device's zone, used only when neither the client nor the account has one. The period, issue date and due date are read in the resolved zone, which a new draft stores as its `tz`.
