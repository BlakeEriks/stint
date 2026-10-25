# Quickstart: checking the phone timer

1. `pnpm dev:up` if the stack is down, the worktree's web server running,
   and `pnpm seed builder@localhost.test`.
2. `pnpm --filter @stint/mobile web` serves the Expo web render; Metro
   proxies `/api/v1` to the web server.
3. Sign in as `builder@localhost.test`: request a code, read it from
   Mailpit, type it. Expect the timer screen with Today, Earned and Recent.
4. Start a timer with a task and project; expect the readout counting at
   once, and the same timer on the web app. Stop it; expect it stopped.
5. Start one on the web, return to the phone tab; expect it running.
6. Tap a Recent row; expect that task running on its project.
7. Tests: `pnpm --filter @stint/mobile test`, `pnpm --filter @stint/mobile
   test:stories`, and `pnpm verify:static`.
8. On a PR: install the Android build from the link in Try it; expect
   "PR <n>" in the header and the PR's seeded account.
