# API changes: Live figures while a timer runs

## `GET /api/v1/stats`

- Every money and seconds figure includes a running entry up to the moment
  of the response: `earnedToday`, `week[].seconds` and `amount`, `month`,
  `month.byClient`, `unbilled`.
- New: `secondsToday` (integer, nonnegative): today's worked seconds, from
  the same row as `earnedToday`.

## `GET /api/v1/entries`

- A running entry's `durationSeconds` is its length at the moment of the
  response, not null. `endedAt` stays null and still marks it running.

## `POST /api/v1/timer/stop`, `GET /api/v1/clients`

- `unbilled` and `unbilledAmount` read the changed `unbilled_by_client`. On
  stop the entry is closed first, so the figure is unchanged in meaning.

## Unchanged

- Invoice create and preview never include a running entry.
- `GET /api/v1/summary` already counts the running entry.
