# Contract: `/api/v1/exports`

Both routes need a session, read only the caller's rows, and change
nothing.

## `GET /api/v1/exports/entries?tz=<IANA zone>`

## `GET /api/v1/exports/invoices?tz=<IANA zone>`

`tz` dates and times every cell and the filename. An unknown zone falls back
to UTC, as `/summary` does.

**200**

```text
content-type: text/csv; charset=utf-8
content-disposition: attachment; filename="stint-entries-2026-10-12.csv"
cache-control: private, no-store
```

The body is the file described in [data-model.md](../data-model.md),
starting with a UTF-8 BOM and a header row, CRLF line ends. A user with no
records gets the header row alone.

**401** `UNAUTHORIZED` without a session, as every route.
