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
- **Decision**: the last ended period only, when it has something to bill and no invoice for the client overlaps it.
- **Rationale**: the draft appears when it can be sent, with its email; nothing empty or half-finished sits on the list, and New invoice stays free for a period under way. A missed run is caught up by the next, as long as it comes within a period.
- **Alternatives**: a draft at the start of each period, collecting as work is logged; it needed empty drafts deleted and blocked a mid-period invoice.

## Time zone
- **Decision**: `user_settings.time_zone`, written by the app shell through `PATCH /settings` when the browser's zone differs; UTC until then.
