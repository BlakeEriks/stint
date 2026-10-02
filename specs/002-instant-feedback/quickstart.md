# Quickstart: Every press answers at once

Validates this feature end-to-end. Assumes `pnpm dev` running per
`docs/local-dev.md` (web) and the macOS app attached via `pnpm try-mac`.

## Prerequisites

- Signed in to local Stint (seeded account + Mailpit, per memory note).
- Chrome/Playwright network throttling or `apps/web/e2e`'s latency-injection
  helper, set to ~1s and ~3s added latency (spec's Independent Test bar).

## Web: predicted mode (User Story 1 & 2)

1. At ~1s latency, press Start. **Expect**: timer shows running, accent
   green, elapsed counting from press — before the network tab shows the
   response (SC-001, Acceptance Scenario 1).
2. Press Stop. **Expect**: stops immediately (Scenario 2).
3. Rename the running timer. **Expect**: new name immediately (Scenario 3).
4. Force a rejection — stop a timer that's already stopped server-side
   (e.g. stop it from a second tab first). **Expect**: visible rollback
   with a reason (Scenario 5, SC-002).
5. Rename then immediately Stop the same timer (the #118 race). **Expect**:
   once both responses land, the final state is the server's, not
   whichever response arrived last (Scenario 6, SC-003).
6. Trigger a stale summary refetch after a fresh press (e.g. window focus
   right after Start). **Expect**: it does not overwrite the newer state
   (Scenario 7, SC-003).
7. Repeat 1–3 for an inbox action, a client edit, a payment-profile edit,
   and a calendar drag (drag should visibly follow the cursor per FR-015,
   not just snap on drop) (User Story 2, Scenarios 1–3).

## Web: pending mode

8. Press "Generate invoice". **Expect**: immediate in-progress state on
   the control, no predicted invoice number, real number/document appears
   on server response (Scenario 4).
9. Send an invoice. **Expect**: same immediate pending pattern (FR-004).

## Web: navigation (User Story 3)

10. Switch to a tab with uncached data at ~3s latency. **Expect**: a
    loading boundary appears immediately, never blank (Scenario 1).
11. Hover/switch toward a tab Next has prefetched. **Expect**: shortened
    or eliminated loading boundary (Scenario 2).

## macOS: menu bar (FR-006, SC-006)

12. From the menu bar, resume a recent task. **Expect**: shows running
    immediately, matching Start's web behavior (Scenario 4).
13. Rename/stop from the menu bar under injected latency (use a
    network-link conditioner or a debug delay build flag). **Expect**:
    same predicted/rollback behavior as web.

## Automated coverage (run before manual walkthrough)

- `pnpm test:ui` — `apps/web/test/ui/mutations.test.ts`: rollback on
  error, rollback on 10s timeout, supersession (latest-press-wins), no
  cache write in pending mode.
- `pnpm test:e2e` — `apps/web/e2e/instant-feedback.spec.ts`: the two #118
  races (Scenarios 6–7) against a real dev server with injected latency.
- `pnpm check:mutation-usage` (new, mirrors `check:type`) — fails if any
  file outside `lib/client/mutations.ts` imports `useMutation` directly.
- macOS: `OptimisticActionTests.swift` in `apps/macos/Tests` — rollback,
  timeout, supersession, mirroring the web Vitest suite.
- Each changed screen state gets a `.stories.tsx` story (Constitution V):
  running-predicted, rolled-back-with-reason, pending-in-progress.

## Success criteria checked here

SC-001 (predicted result same frame), SC-002 (visible rollback + reason),
SC-003 (#118 races resolve to server truth), SC-004 (loading
boundary/prefetch, never blank/stale), SC-005 (lint fails on bypass),
SC-006 (menu-bar resume matches Start).
