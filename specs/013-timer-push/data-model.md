# Data model: Push timer changes to Android phones

## `push_devices`

| Column | Type | Rule |
| --- | --- | --- |
| `user_id` | `uuid` | `auth.users`, `on delete cascade` |
| `token` | `text` | the provider's address for the phone, 1–4096 characters |
| `platform` | `text` | `android`; #471 adds `ios` |
| `created_at` | `timestamptz` | `now()` |

Primary key `(user_id, token)`: registering again is a no-op, and a token
can sit under two accounts (spec, Clarifications). RLS: select, insert and
delete own rows. No update: a new token is a new row.
