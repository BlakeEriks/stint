# Quickstart: First-run setup

Run the app from this worktree (`docs/local-dev.md`) and sign in as the
seeded account.

1. **Rate row**: in Settings, clear the default hourly rate. Home's Inbox
   shows "Set your default rate"; enter one and Save. The row leaves at once
   and Home's figures show money.
2. **Welcome dialog**: run
   `update user_settings set welcomed_at = null;` against the local database
   and reload Home. Step 1 asks for the rate; Next shows step 2; Start
   tracking with a client name closes it and the client is on Clients.
   Reload: it does not come back.
3. **Business details**: clear business name in Settings, then open New
   invoice. The notice shows and Generate is disabled. Add details, fill
   name and email, Save: the notice goes and Generate enables.

Suites: `pnpm --filter @stint/web test` (routes), `test:stories`, and the stories named in
`plan.md`.
