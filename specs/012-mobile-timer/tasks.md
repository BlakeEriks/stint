# Tasks: A phone timer for iPhone and Android

**Input**: `specs/012-mobile-timer/` (plan, spec, research, data-model, contracts)

Format: `- [ ] T### [P?] [US?] what, in which file`. `[P]` runs in parallel
with its neighbors.

## Phase 1: Setup

- [ ] T001 Create `packages/client` (`@stint/client`): `package.json` with React and React Query as peers, root `tsconfig.json` path, web `tsconfig.json` path, `transpilePackages` in `apps/web/next.config.ts`
- [ ] T002 Scaffold `apps/mobile` on Expo 58: `package.json`, `app.config.ts`, `eas.json`, `metro.config.js`, `tsconfig.json`, `index.ts`; React 19.3.1, `pnpm tokens` before Metro and in `eas-build-post-install`

## Phase 2: Foundational (the shared client)

- [ ] T003 Move `ApiError`, the response types and `Include` into `packages/client/src/api.ts`; `apps/web/src/lib/client/api.ts` keeps its `request` and endpoints and imports them
- [ ] T004 Move `query-keys.ts` and `mutations.ts` to `packages/client/src`; web imports from `@stint/client`
- [ ] T005 Move `useTimer` to `packages/client/src/use-timer.ts` as `useTimer(api)`; `apps/web/src/lib/client/use-timer.ts` binds the web's `api`
- [ ] T006 Move `check-mutation-usage.mjs` to `scripts/`, allowing only `packages/client/src/mutations.ts` and scanning `apps/web/src` and `apps/mobile/src`; `package.json`, `ci.yml`
- [ ] T007 Run `pnpm verify:static`: the web's suites pass unchanged on the moved code

## Phase 3: User Story 2, sign in with an emailed code (P1)

- [ ] T008 [P] [US2] Tests first, `apps/mobile/test/session.test.ts`: code request and verify, refresh shared by concurrent callers, sign-out only on a GoTrue 400/401 refresh, kept on offline or 5xx, session per backend host
- [ ] T009 [P] [US2] Tests first, `apps/mobile/test/target.test.ts`: local, preview and prod resolve to the contract's values; preview without a PR fails
- [ ] T010 [US2] `apps/mobile/src/target.ts`, `src/session.ts`, `src/storage.ts`, `src/storage.web.ts`
- [ ] T011 [US2] `apps/mobile/src/screens/sign-in.tsx` and its stories: email, code empty, code error

## Phase 4: User Story 1, start and stop (P1)

- [ ] T012 [P] [US1] Tests first, `apps/mobile/test/request.test.ts`: bearer header, one retry after a refresh on 401, a rejected session after the retry, the bypass header on preview, `ApiError` from an error body
- [ ] T013 [US1] `apps/mobile/src/request.ts` and `src/api.ts`: the seven calls
- [ ] T014 [US1] `apps/mobile/src/app/`: QueryClient, `focusManager` on `AppState`, the root that switches sign-in and timer, preview sign-in on launch
- [ ] T015 [US1] `apps/mobile/src/screens/timer.tsx`: header, dock stopped and running, project picker, Recent, notice; stories for stopped, running, refused, offline, long task name
- [ ] T016 [US1] `apps/mobile/src/screens/settings.tsx`: email, Sign out

## Phase 5: User Story 3, today at a glance (P2)

- [ ] T017 [US3] Today and Earned in the timer screen from `summary` and `stats`; the first-day story

## Phase 6: User Story 4, try and release (P3)

- [ ] T018 [US4] `.github/workflows/mobile-preview.yml`: the PR's Android build and its link on the PR
- [ ] T019 [US4] `docs/mobile.md`: running, backends, sign-in, preview builds, release, the owner's one-time setup

## Phase 7: Polish

- [ ] T020 Mobile story runner `apps/mobile/test/stories/stories.test.tsx` and its Vitest config; CI: mobile tests, typecheck, stories
- [ ] T021 Constitution 8.0.4 (Principle VI's path, Principle V's mobile row); `CLAUDE.md` table row for `docs/mobile.md`; `docs/sdlc.md`
- [ ] T022 Doc drift, `pnpm hygiene`, `pnpm verify:static`, the web render signed in as `builder@localhost.test`

## Dependencies

Phase 2 before everything; US2 before US1 (a session to call with); US3
rides on US1's screen; US4 after US1.
