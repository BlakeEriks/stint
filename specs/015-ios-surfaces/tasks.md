# Tasks: The timer outside the iPhone app

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/surfaces-module.md](contracts/surfaces-module.md)

Tests come first in each phase (Constitution V).

## Phase 1: Foundational

- [ ] T001 Tests first in apps/mobile/test/session.test.ts: a refresh uses a session another process stored since, and spends no refresh token
- [ ] T002 apps/mobile/src/session.ts: `refresh()` reads the stored session first
- [ ] T003 Tests first in apps/mobile/test/surfaces.test.ts: the iOS draw carries `failed` and `backend`, and `backend` is `null` signed out
- [ ] T004 apps/mobile/src/surfaces-native.ts: draws on iOS too, with `failed` and `backend`
- [ ] T005 apps/mobile/app.config.ts and eas.json: `@bacons/apple-targets`, `NSSupportsLiveActivities`, no `aps-environment`, the `simulator` profile; test in apps/mobile/test/app-config.test.ts first

## Phase 2: User Story 1 and 2 — the Live Activity and widgets (P1, P2)

- [ ] T006 [US1] apps/mobile/modules/stint-surfaces/ios: the module, `draw`, the keychain item, the Live Activity
- [ ] T007 [US1] The press in Swift: prediction, session, refresh, the request, 10s, the outcome; the `pressed` event and its listener in apps/mobile/src/main/app.tsx
- [ ] T008 [US1] apps/mobile/targets/widget: the Live Activity's lock screen and Dynamic Island views
- [ ] T009 [US2] The widgets: small, medium, lock screen rectangle and circle, each state

## Phase 3: User Story 3 and 4 — Siri and the control (P3)

- [ ] T010 [US3] The intents and App Shortcuts in apps/mobile/targets/widget/_shared
- [ ] T011 [US4] The control toggle, iOS 18

## Phase 4: Polish

- [ ] T012 Stint Local through Metro: apps/mobile/src/config.ts, apps/mobile/src/target.ts, apps/mobile/metro.config.cjs, with tests in apps/mobile/test/target.test.ts
- [ ] T013 docs/mobile.md (Outside the app, Running it), via doc-drift
- [ ] T014 `pnpm verify:static`; mobile tests and typecheck; an EAS simulator build seen on EAS Simulator
