# Data model: Invoices can come from more than one business

## `business_profiles`

| Column | Type | Rule |
| --- | --- | --- |
| `id` | uuid | client-generated when given |
| `user_id` | uuid | owner; RLS own rows; a connected app is refused |
| `name` | text | not blank |
| `email` | text | null only for a backfilled row; the API requires one, and an invoice refuses a business without one |
| `address` | text | |
| `logo_url` | text | |
| `is_default` | boolean | at most one live per user (`one_default_business_profile_per_user`) |
| `archived_at` | timestamptz | archived, never deleted |
| `created_at`, `updated_at` | timestamptz | |

## `invoices.business_profile_id`

uuid, `(business_profile_id, user_id)` references `business_profiles (id, user_id)`, so an invoice can only name its owner's business. Set by `create_invoice`; `stamp_invoice_parties` copies `name`, `address`, `email` and `logo_url` from it into the existing `business_*` and `logo_url` columns. Null on invoices made before this feature.

## Removed

`user_settings.business_name`, `business_address`, `business_email`, `logo_url`.
