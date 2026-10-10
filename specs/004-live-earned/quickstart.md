# Quickstart: Live figures while a timer runs

Run the app from this worktree (`docs/local-dev.md`) and sign in with the
seeded account.

1. **Today moves.** Start a timer on a rated project and leave the home
   screen open. After a minute, Today's Earned, its duration, the running
   row and the dock's Today all moved together.
2. **Week and month move.** Today's week bar and the month's Earned rose by
   the same amount as Today's Earned.
3. **Stopping is still.** Stop the timer: no money figure changes beyond the
   last minute's earnings.
4. **No rate, no money.** Run a timer on an unrated project: time grows,
   Earned does not.
5. **Hidden tab is quiet.** With a timer running, hide the tab for two
   minutes: no `/stats` requests in the network log. Show it: one refresh at
   once.
6. **Invoice stays closed.** With a timer running, preview an invoice for
   that client: the running entry isn't on it.
7. **macOS.** `apps/macos/qa.sh`: with the panel closed, only `/summary`
   polls; opening it refreshes Unbilled, which includes the running session.

Suites: `routes.test.ts`, `rates.test.ts`, `mocks-parity.test.ts`,
`packages/core/test`, the Today stories, and `swift test` in `apps/macos`.
