# Quickstart: Invoices can come from more than one business

1. Signed in as `builder@localhost.test`, open Settings: Businesses lists the seeded business as the default. Add a second.
2. New invoice for a client: the From block prints the default. Press it, pick the second; the page prints it. Save draft; the draft prints it.
3. New invoice for the same client again: the From block is the second business with no pick.
4. Tests: `packages/core/test`, `TT=tt_838 pnpm db:setup && TT=tt_838 pnpm verify:db`, the Settings and New invoice stories.
