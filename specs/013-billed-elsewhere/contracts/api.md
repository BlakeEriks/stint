# API: Mark entries as billed outside Stint

## `POST /api/v1/entries/invoiced-elsewhere`

Body: `{ ids: uuid[] (1–1000), invoicedElsewhere: boolean }`.

Sets `invoicedElsewhere` on each of the user's entries among `ids` that is
finished and on no invoice; clearing applies to any of them. Ids it can't
change (another user's, running, invoiced, missing) are skipped.

`200 { ids: uuid[] }`: the entries it changed. `422 VALIDATION_FAILED` on a
bad body.

## `PATCH /api/v1/entries/:id`

Accepts `invoicedElsewhere`. `true` on an entry on an invoice is
`409 ENTRY_ALREADY_INVOICED`.

## `TimeEntry`

Gains `invoicedElsewhere: boolean`.
