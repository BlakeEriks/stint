# Quickstart: Say in the Inbox when a client is ready to invoice

1. Signed in as `builder@localhost.test`, set Meridian Labs to bill weekly, starting on the Monday two weeks ago.
2. If its last ended week holds unbilled work, Home's Inbox shows a Meridian Labs row with its time and "<that week's dates> is ready to invoice".
3. The row's link opens New invoice with Meridian and those dates.
4. Tests: `packages/core/test`, `TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`, `apps/web/test/ui`, the dock stories.
