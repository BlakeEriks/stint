# API changes

- `GET/PATCH /settings`: `defaultPaymentTerms` (string) → `paymentTermsDays` (integer 0–365). A PATCH carrying it clears the inbox notice.
- `GET/POST/PATCH /clients`: `paymentTermsDays` (integer 0–365 or null; omitted on PATCH leaves it).
- `POST /invoices`: `paymentTerms` removed. `dueDate` absent → issue date plus the client's days, else the user's. `dueDate` before the issue date → `422 VALIDATION_FAILED` naming `dueDate`. The response's `paymentTerms` is "Net N" or "Due on receipt" for those dates.
- `GET /stats`: `attention.paymentTermsToCheck`: the old terms text to check, or null.
