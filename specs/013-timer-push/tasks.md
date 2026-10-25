# Tasks: Push timer changes to Android phones

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

Tests come first in each phase (Constitution V).

## Phase 1: Foundational

- [x] T001 Migration `push_devices` (data-model.md) via `pnpm exec supabase migration new push_devices`; `push_devices` in `EXPECTED` in scripts/verify-schema.mjs; private test DBs with scripts/ci-db.sh
- [x] T002 [P] RLS test first in apps/web/test/rls.test.ts: Bob can't read, insert as Alice, or delete Alice's devices
- [x] T003 [P] Schema in packages/schema/src/index.ts: `PushPlatform = z.enum(['android'])`, `RegisterPushDevice { token, platform }`, `UnregisterPushDevice { token }`
- [x] T004 [P] Core tests first in packages/core/test/push.test.ts, then packages/core/src/push.ts: `fcmTimerMessage(token)`; `fcmOutcome(status, body)` → `sent`, `dead` (404 `UNREGISTERED`), `retry` (429, 5xx), `failed`

## Phase 2: User Story 2 — register and remove a phone (P2, needed by US1)

- [x] T005 [US2] Route tests first in apps/web/test/routes.test.ts: POST registers, twice is one row; 422 for `ios` or no token; DELETE removes, and an unknown token is 204
- [x] T006 [US2] apps/web/src/app/api/v1/push-devices/route.ts

## Phase 3: User Story 1 and 3 — every timer change pushes, and a failure never fails the write

- [x] T007 `after()` in apps/web/test/next-server-stub.mjs, collecting tasks the tests await; apps/web/test/fake-fcm.ts answering the token and send endpoints, verifying the JWT's signature
- [x] T008 [US1] Route tests first: start, stop, `PATCH /timer/current`, `PATCH /entries/:id` on the running entry and one that stops it, `DELETE` of the running entry each send one message per device; a PATCH of a stopped entry's task and a refused start send none; no devices sends none
- [x] T009 [US3] Route tests first: 500 then 200 sends twice; 500 twice reports to Sentry and the start is still 201; 404 `UNREGISTERED` deletes the row and reports nothing; no `FCM_SERVICE_ACCOUNT` sends nothing; the access token is fetched once for two sends
- [x] T010 apps/web/src/lib/fcm.ts (config, token, send) and apps/web/src/lib/push.ts (`pushTimerChanged`, providers by platform)
- [x] T011 [US1] Call `pushTimerChanged()` from the timer routes and entries/[id]

## Phase 4: The phone

- [x] T012 Tests first in apps/mobile/test/push.test.ts: the handler invalidates the timer's data, and skips while a write is in flight; registration posts the token once per token, re-registers a new one, and unregisters on sign-out without blocking it
- [x] T013 apps/mobile/src/push.ts, wired in apps/mobile/src/main/app.tsx and index.ts; `expo-notifications`, `expo-task-manager`; `android.googleServicesFile` and `extra.push` in apps/mobile/app.config.ts

## Phase 5: Polish

- [x] T014 Docs: docs/api.md, docs/data-model.md, docs/mobile.md, docs/deploying.md (FCM_SERVICE_ACCOUNT), via doc-drift
- [x] T015 `pnpm hygiene` on touched files; `pnpm verify:static`; `pnpm db:setup && pnpm verify:db`; Expo web render still signs in and shows the timer
