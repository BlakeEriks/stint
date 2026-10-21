# Quickstart: Every screen paints once

Run from `../stint-f383-paint-once`, signed in to local Stint
(`docs/local-dev.md`).

## Web

1. `pnpm dev`, then open Home. In DevTools, set Network to **Slow 4G** and
   reload with the cache disabled.
   - Under 800ms nothing shows in the content area; then "Loading" fades in
     and breathes. The rail, header and dock never move.
   - The panel appears in one step: bars already in client colors, legend
     complete. Nothing changes after it appears.
2. Repeat on Calendar, Clients, a client, Invoices, an invoice, New invoice
   and Settings: each content area goes from blank or "Loading" to complete
   in one step.
3. Turn throttling off, load Home, then reload with Slow 4G. The previous
   panel appears at once with no loader; it updates only where the server's
   answer differs.
4. Sign out, then sign in as another seeded account. No number from the
   first account appears at any point.
5. With **Emulate CSS prefers-reduced-motion: reduce**, the word fades in
   and holds still.

## macOS

1. `pnpm try-mac` or `apps/macos/qa.sh` with the dev API slowed. On launch,
   open the panel: "Loading" until the timer arrives, then the timer, recent
   tasks, picker and figures appear together.
2. Quit and relaunch: the picker, recent tasks and figures appear with the
   timer, without a second step.
3. Sign out: `~/Library/Caches/Stint/snapshot.json` is gone.

## Suites

- `pnpm --filter @stint/core test` (`dayByClient`)
- `pnpm --filter @stint/web test` (routes, ui)
- Storybook loading stories render in CI
- `cd apps/macos && swift test`
