# API changes: First-run setup

## `GET /api/v1/settings`, `PATCH /api/v1/settings`

The settings body gains `welcomedAt: string | null` (ISO 8601). `PATCH`
accepts it like any other field.

## `GET /api/v1/stats`

`attention` gains `noDefaultRate: boolean`, true while the account has no
default hourly rate.

## `POST /api/v1/invoices`

Refuses with `422 VALIDATION_FAILED`, "Add your business name and email
before generating an invoice.", while `business_name` or `business_email` is
empty or blank. Nothing is written.
