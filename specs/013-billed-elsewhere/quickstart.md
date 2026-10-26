# Quickstart: Mark entries as billed outside Stint

1. Signed in as `builder@localhost.test`, note Home's Unbilled and Earned.
2. New invoice, a client with unbilled work: press Billed elsewhere. The toast counts the entries; the card has nothing to bill; Home's Unbilled dropped, Earned didn't.
3. Press Undo: the card shows the work again.
4. Calendar, an unbilled entry: tick Billed elsewhere, save; Unbilled drops. Untick, save; it returns.
5. Tests: the routes and RLS suites against a private DB (`pnpm db:setup && pnpm verify:db`), `apps/web/test/ui`, the stories.
