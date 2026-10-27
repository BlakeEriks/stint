# Tasks: The timer outside the Android app

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/surfaces-module.md](contracts/surfaces-module.md)

Tests come first in each phase (Constitution V).

## Phase 1: Foundational

- [ ] T001 packages/client/src/mutations.ts: `optimisticOptions(queryClient, opts)` holds the hook's rules; `useOptimisticMutation` passes them to `useMutation`, and `pressOnce(queryClient, opts, vars)` runs them on a `MutationObserver`; apps/web/test/ui stays green
- [ ] T002 Tests first in apps/mobile/test/surfaces.test.ts: `surfaceState()` for running, stopped with a recent task, first day, signed out, and a failed press
- [ ] T003 apps/mobile/src/surfaces.ts: `surfaceState()`, `createSurfaces({ queryClient, api, draw, signedIn })`

## Phase 2: User Story 1 and 2 — presses and the notification and widgets (P1, P2)

- [ ] T004 [US1] Tests first: a stop draws stopped at once and the server's timer after; a refusal draws what the server holds with the reason; two presses reach the server in press order; a push refetches and draws unless a press is in flight
- [ ] T005 [US1] The press and the refresh in apps/mobile/src/surfaces.ts; the `StintPress` headless task in apps/mobile/index.ts; drawing on every cache change, on sign-in and sign-out, and the push in apps/mobile/src/main/app.tsx
- [ ] T006 [US1] apps/mobile/modules/stint-surfaces: module, `draw`, the notification with chronometer, Stop and promotion; press receiver and worker; notification permission asked once in the app
- [ ] T007 [US2] The widgets: both providers, layouts, fonts, colors per theme, a prediction drawn on press

## Phase 3: User Story 3 and 4 — tile and shortcuts (P3)

- [ ] T008 [US3] The tile service: on and off, its subtitle, unlock first, sign-in opens the app
- [ ] T009 [US4] Dynamic shortcuts from `draw`; `stint://press/*` handled in apps/mobile/src/main/app.tsx

## Phase 4: Polish

- [ ] T010 docs/mobile.md (Outside the app), via doc-drift
- [ ] T011 `pnpm verify:static`; mobile tests and typecheck; the Expo web render still signs in and shows the timer
