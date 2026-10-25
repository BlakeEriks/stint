# Implementation Plan: Push timer changes to Android phones

**Branch**: `f463-push` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-timer-push/spec.md`

## Summary

A `push_devices` table holds each user's phones (user, platform, token),
with RLS. `POST /api/v1/push-devices` registers a token and `DELETE`
removes it. Every timer route that changes the running entry calls
`pushTimerChanged()`, which schedules the send with `after()` from
`next/server`, so it runs once the response is out. The sender reads the
user's devices and hands each to its platform's provider; the only one is
FCM HTTP v1, signed with a service account from `FCM_SERVICE_ACCOUNT`.
The message is built by a pure function in `@stint/core`: data only
(`kind: timer`), high priority, collapse key `timer`. The phone registers
its FCM token through `expo-notifications` and, on a push, refetches the
timer unless a press is in flight.

## Technical Context

**Language/Version**: TypeScript; Next.js 16 route handlers; Expo SDK 58 / React Native; SQL

**Primary Dependencies**: `node:crypto` for the service account's RS256 token; `expo-notifications` and `expo-task-manager` on the phone (native code)

**Storage**: Supabase Postgres: one new table, `push_devices`

**Testing**: `packages/core/test` (message and response classification); `apps/web/test/routes.test.ts` (routes, sends, retries, dead tokens, Sentry, unconfigured); `apps/web/test/rls.test.ts` (cross-user); `apps/mobile/test` (the push handler's refetch rule and registration)

**Target Platform**: Server: Vercel. Phone: Android; iPhone is #471.

**Project Type**: Web service and mobile client in the existing monorepo

**Performance Goals**: The timer routes answer as fast as before; a push reaches an open phone in under 5 seconds

**Constraints**: No new fixed cost (FCM is free); a send never fails a write; no secret in the phone build

**Scale/Scope**: One user, a handful of devices

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Only a token the provider calls unregistered is deleted; that is the provider's fact about the phone, not the user's data. |
| II. Logic written twice has a parity test | No | Nothing exists in both TypeScript and SQL. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Registration is two routes. The push carries no timer, so the phone always asks the server. |
| IV. `packages/core` does no I/O | Yes | `fcmTimerMessage()` and `fcmOutcome()` are pure; signing and fetch live in `apps/web/src/lib/fcm.ts`. |
| V. Tests first where a regression is silent | Yes | Routes: register idempotent, unregister, every timer change sends, a non-change doesn't, retry once, dead token deleted, Sentry on failure, unconfigured sends nothing, a write still answers when FCM is down. RLS: cross-user read, insert and delete. Core: message shape and outcomes. Mobile: the handler skips while a press is in flight. |
| VI. Every press answers in the same frame | Yes | No new press. The push's refetch follows `followRunningTimer`'s rule: none while a write is in flight. |

Additional constraints: no new fixed cost (FCM free, Firebase Spark plan);
record ids: a device's key is its token, which the provider issues, so no
`uuidv7()` id is needed; online-only unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/013-timer-push/
├── plan.md, research.md, data-model.md, quickstart.md
└── contracts/api.md
```

### Source Code (repository root)

```text
supabase/migrations/<ts>_push_devices.sql      table, RLS, grants
packages/schema/src/index.ts                   PushPlatform, RegisterPushDevice, UnregisterPushDevice
packages/core/src/push.ts                      fcmTimerMessage(), fcmOutcome()
apps/web/src/lib/push.ts                       pushTimerChanged(): after(), devices, providers, Sentry
apps/web/src/lib/fcm.ts                        FCM provider: config, access token, send
apps/web/src/app/api/v1/push-devices/route.ts  POST, DELETE
apps/web/src/app/api/v1/timer/{start,stop,current}/route.ts, entries/[id]/route.ts   call pushTimerChanged()
apps/web/test/next-server-stub.mjs             after()
apps/web/test/fake-fcm.ts                      FCM's token and send endpoints, in memory
apps/mobile/src/push.ts                        registration and the push handler
apps/mobile/app.config.ts                      googleServicesFile, expo-notifications plugin
scripts/verify-schema.mjs                      expects push_devices
docs/api.md, docs/data-model.md, docs/mobile.md, docs/deploying.md
```

**Structure Decision**: Existing monorepo layout; one new route, one table.

## Complexity Tracking

No principle is broken.
