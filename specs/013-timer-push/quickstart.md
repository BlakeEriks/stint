# Quickstart: Push timer changes to Android phones

1. Tests: `pnpm --filter @stint/core test`, `pnpm db:setup && pnpm verify:db`, `pnpm --filter @stint/mobile test`.
2. Phone (the owner's Pixel 9, after the Firebase steps in the PR): install the PR's build, sign in, keep it open. Start a timer on the PR's preview: the phone shows it within 5 seconds. Retitle it, stop it: the phone follows.
3. Sign out on the phone; `select * from push_devices` on the preview database has no row for it.
