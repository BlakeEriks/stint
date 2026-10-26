# Data model: Payment terms are a number of days

| Table | Column | Type | Rule |
| --- | --- | --- | --- |
| `user_settings` | `payment_terms_days` | `int not null default 30` | `check (payment_terms_days between 0 and 365)` |
| `user_settings` | `legacy_payment_terms` | `text` | The old text the backfill couldn't read; null otherwise, and nulled by a settings save of `payment_terms_days` |
| `user_settings` | `default_payment_terms` | — | Dropped after the backfill |
| `clients` | `payment_terms_days` | `int` | Null falls back to the user's; same check |
| `invoices` | `payment_terms`, `due_date` | unchanged | Written once at creation from the dates; never rewritten |

Resolution: `clients.payment_terms_days ?? user_settings.payment_terms_days`.

Function: `legacy_payment_terms_days(text) returns int`, `immutable`, null for unreadable text; no grant to `anon` or `authenticated`.
