# Implementation Plan: The timer outside the Android app

**Branch**: `f465-android-surfaces` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-android-surfaces/spec.md`

## Summary

JavaScript decides and Kotlin draws. The app's own module-level
`QueryClient` and `api` (`apps/mobile/src/main/app.tsx`) also run without a
screen, so a press from a widget, the notification or the tile goes through
the same mutation as a press in the app: one shared lane, the latest press
wins, and the same 10s bound. After every change to the cached timer, JS
derives one **surface state** and hands it to a local Expo module,
`apps/mobile/modules/stint-surfaces`. The module draws the notification, both
widgets, the tile and the shortcut from that state, keeping nothing of its
own. A press on a native surface first draws its prediction natively, in the
same frame, then starts the JS press through WorkManager. A push with the
app closed fetches the timer and draws again.

## Technical Context

**Language/Version**: TypeScript 6 (React Native 0.88, Expo SDK 58); Kotlin
for the module (Android Gradle Plugin 9.2, compile SDK 37, min SDK 24)

**Primary Dependencies**: `@tanstack/react-query` (`MutationObserver` for a
press without React), `expo-notifications` (permission, push task),
`expo-modules-core`, `androidx.work`

**Storage**: the last drawn state in the module's `SharedPreferences`, so a
widget or tile drawn after a reboot shows it

**Testing**: `apps/mobile/test` (node:test) for the state, the press and the
push; `apps/web/test/ui` keeps covering `useOptimisticMutation`

**Target Platform**: Android 7.0 and later; iOS and web get a no-op module

**Project Type**: mobile app

**Constraints**: no Android SDK on the build machine, so the Kotlin first
compiles in the PR's EAS build (`mobile-preview.yml`)

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | A failed press shows its reason on the surface that pressed. Start begins a task the surface names, never a guessed one. |
| II. Logic written twice has a parity test | No | Kotlin draws a state JS derived; it decides nothing. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Presses call the same `api`; every draw after an answer or push is the server's timer. |
| IV. `packages/core` does no I/O | No | Nothing added to core. |
| V. Tests first where a regression is silent | Yes | Surface state, presses and the push path get node tests first. The widget is native, so it has no story; its look is `design/surfaces.html`. |
| VI. Every press answers in the same frame | Yes | Native draws the prediction on press; the JS press runs through `useOptimisticMutation`'s own options, made callable without React. |

Additional Constraints: one running timer (a refused start shows the running
one), client-generated ids (`uuidv7()` per press), no new fixed cost.

## Project Structure

```text
packages/client/src/mutations.ts      # optimisticOptions() and pressOnce(), the hook's own rules without React
apps/mobile/src/surfaces.ts           # surfaceState(), the press, refreshing on push and sign-in
apps/mobile/src/surfaces-native.ts    # the module, a no-op off Android
apps/mobile/src/main/app.tsx          # draws on every timer change; links and sign-out
apps/mobile/index.ts                  # the headless press task
apps/mobile/modules/stint-surfaces/   # Kotlin: module, notification, widgets, tile, shortcuts, press worker
apps/mobile/test/surfaces.test.ts
docs/mobile.md                        # Outside the app
```

## Complexity Tracking

None.
