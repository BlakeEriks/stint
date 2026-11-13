# Quickstart: New invoice offers to include unbilled work dated just before its period

1. Signed in as `builder@localhost.test`, send an invoice for a client ending a day before today's month starts, then log billable work on the day between.
2. New invoice for that client and this month says "1 earlier entry, <date>, isn't on any invoice." above the preview.
3. Start from <date> moves From to that date, and the preview bills the entry.
4. Tests: `packages/core/test`, `TT=tt_569 pnpm db:setup && TT=tt_569 pnpm verify:db`, the New invoice stories.
