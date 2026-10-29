# Quickstart: Say in the Inbox when billable work is past due to bill

1. Signed in as `builder@localhost.test`, set Meridian Labs to bill weekly, starting on the Monday two weeks ago.
2. Home's Inbox shows one Meridian Labs row with its time: a week's dates "ended with no invoice" when only one ended week holds its work, otherwise "unbilled since" its first day.
3. Create invoice opens New invoice with Meridian and those dates. Back on Home, Billed elsewhere removes the row at once.
4. Tests: `packages/core/test`, `TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`, `apps/web/test/ui`, the dock stories.
