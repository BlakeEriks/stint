# Research: automatic drafts

## When a number is given
- **Decision**: first PDF render, inline or download.
- **Rationale**: both are paid and both can reach a client; one moment, no ambiguity.
- **Alternatives**: download only (an inline tab can be printed and sent too); Mark sent (the PDF sent would carry no number).

## The scheduler
- **Decision**: Vercel Cron, daily at 14:00 UTC (morning across the US), calling `/api/v1/cron/drafts` with `Authorization: Bearer $CRON_SECRET`.
- **Rationale**: Hobby allows one daily cron at no cost; Vercel sends the secret itself.
- **Alternatives**: Supabase pg_cron cannot run the TS line builder.

## Mail
- **Decision**: `fetch` to `https://api.resend.com/emails` with `RESEND_API_KEY` and `MAIL_FROM`; without the key, Mailpit's `POST /api/v1/send` at `MAILPIT_URL` (local); without either, the job skips sending and leaves the draft unclaimed.
- **Rationale**: Resend already sends sign-in mail on its free tier; no SDK needed.

## Idempotence
- **Decision**: drafts: a unique index on `(user_id, client_id, period_start, period_end) where auto`, plus the overlap check; email: claim with `update … set ready_emailed_at = now() where ready_emailed_at is null returning`, released on failure.
- **Rationale**: concurrent runs race only on those two writes.

## Which periods
- **Decision**: the current period and the last ended one, each only if no invoice for the client overlaps it.
- **Rationale**: catches up one missed run window, which is any gap shorter than a period, without walking history.

## Time zone
- **Decision**: `user_settings.time_zone`, written by the app shell through `PATCH /settings` when the browser's zone differs; UTC until then.
