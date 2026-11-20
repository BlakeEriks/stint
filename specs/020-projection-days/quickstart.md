# Quickstart: projection days

1. `node --test packages/core/test/holidays.test.ts packages/core/test/stats.test.ts`:
   every holiday rule and shift, and each rule's counted days and pace.
2. `TT=tt_809 pnpm db:setup && TT=tt_809 pnpm verify:db`: the setting
   round-trips and `/stats` counts under it.
3. Signed in locally as `builder@localhost.test`, open Settings, set
   **Days that count** to **Every day**, then open Home: the card reads
   "N of 30 working days" in a 30-day month and the chart has a point per
   day. Set it back to **Weekdays** and the figures match what they were.
