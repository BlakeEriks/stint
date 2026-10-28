# Quickstart: Say in the Inbox when a scheduled period has ended with no invoice

1. Signed in as `builder@localhost.test`, open Clients and set Meridian Labs to bill monthly.
2. Home's Inbox shows "Meridian Labs", last month's time, and "September ended with no invoice" (last month's name).
3. Press Create invoice: New invoice opens with Meridian Labs and last month filled in. Create the draft.
4. Back on Home, the row is gone. Void the draft: the row is back.
5. Tests: `packages/core/test`, the routes suite against a private DB (`TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`), `apps/web/test/ui`, the dock stories.
