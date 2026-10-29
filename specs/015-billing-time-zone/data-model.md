# Data model: billing time zone

| Table | Column | Type | Rule |
| --- | --- | --- | --- |
| `user_settings` | `billing_time_zone` | `text`, nullable | An IANA zone; null only on an account the backfill found no invoice for and that has not picked one. |
| `clients` | `billing_time_zone` | `text`, nullable | An IANA zone; null follows the account's. |

`invoices.tz` is unchanged: the zone a draft was generated in, kept when
sent. The API validates zones (`ianaZone`); the database stores what the API
accepted.

Backfill: `user_settings.billing_time_zone` = the `tz` of the user's
invoice with the highest `sequence_no` and a non-null `tz`.
