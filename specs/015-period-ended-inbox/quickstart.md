# Quickstart: Say in the Inbox when a scheduled period has ended with no invoice

1. Signed in as `builder@localhost.test`, open Clients and set Meridian Labs to bill weekly, starting nine days ago. The seed logs Meridian work eight days ago, so the week that last ended holds it.
2. Home's Inbox shows "Meridian Labs", 3h, and that week's dates, "ended with no invoice".
3. Press Create invoice: New invoice opens with Meridian Labs and that week filled in. Generate the draft.
4. Back on Home, the row is gone. Void the draft: the row is back.
5. Tests: `packages/core/test`, the routes suite against a private DB (`TT=tt_482 pnpm db:setup && TT=tt_482 pnpm verify:db`), `apps/web/test/ui`, the dock stories.
