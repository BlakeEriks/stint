# Data Model: Feedback from inside the app

## `feedback`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | `uuid` primary key | Client-generated `uuidv7()`. A retry reuses it. |
| `user_id` | `uuid not null` references `auth.users(id) on delete cascade` | The sender. |
| `message` | `text not null` | 1–2,000 characters after trimming its ends. A `check` constraint enforces the same limit as the schema. |
| `screen` | `text not null` | The pathname it was sent from, at most 200 characters. |
| `client` | `text not null` | `'web'` or `'macos'`, enforced by a `check`. Only `web` sends today. |
| `app_version` | `text not null` | The build version the nav shows, at most 64 characters. |
| `created_at` | `timestamptz not null default now()` | When it was sent. |

Index: `(created_at desc)`, for the dashboard's newest-first read.

RLS is enabled with two policies: insert where `user_id = auth.uid()`, and
select where `user_id = auth.uid()`. There's no update or delete policy, so
a row never changes once inserted.

There are no state transitions. A submission is written once.
