# Implementation Plan: The timer outside the iPhone app

**Branch**: `ios-surfaces` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-ios-surfaces/spec.md`

## Summary

JavaScript decides and Swift draws, as on Android (spec 014): after every
change to the cached timer, `src/surfaces.ts` derives the same surface state
and the local module `modules/stint-surfaces` hands it to every iPhone
surface. Its iOS half keeps the state, with what a press would show, in a
keychain item the widget extension can read, reloads the widgets and the
control, and starts, updates or ends the Live Activity.

A press differs from Android's. iOS runs a widget's, the Live Activity's,
the control's or Siri's App Intent in the app's process, launched in the
background with no scene, and React Native starts only with a scene. So the
press is Swift: the module draws the prediction, calls `/api/v1` with the
app's own session, and draws the answer. The widget extension draws and
never calls the server. The targets are added with `@bacons/apple-targets`.

## Technical Context

**Language/Version**: TypeScript 6 (React Native 0.88, Expo SDK 58); Swift
6 for the module and the widget extension

**Primary Dependencies**: `@bacons/apple-targets` 5 (the widget extension
and the `_shared` intents), WidgetKit, ActivityKit, AppIntents

**Storage**: one keychain item, `dev.stint.surfaces`, readable after first
unlock, in the shared keychain group the session already uses

**Testing**: `apps/mobile/test` (node:test) for the state handed to Swift
and the session the press and the app share; the Swift is seen on EAS
Simulator

**Target Platform**: iOS 17 and later for the surfaces, iOS 18 for the
control; the app stays at iOS 16.4

**Project Type**: mobile app

**Constraints**: no Xcode on the build machine: the Swift first compiles in
an EAS Build simulator build, unsigned. Nothing may need the Apple
Developer Program: no app group, no Siri capability, no push entitlement.

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | A failed press shows its reason on the surface that pressed. Start begins the task the surface names. |
| II. Logic written twice has a parity test | No | No rule exists in both TypeScript and SQL. Swift's press reads what JS decided (`pressed`, the failure's words). |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Swift's press calls `/api/v1/timer/start` and `/stop`; the server's answer replaces the prediction, and the app's next read replaces everything. |
| IV. `packages/core` does no I/O | No | Nothing added to core. |
| V. Tests first where a regression is silent | Partly | The state, the press's words and the shared session get node tests first. The Swift press has no suite: see Complexity Tracking. |
| VI. Every press answers in the same frame | Partly | Swift draws the prediction before the request, fails it after 10s and takes a late answer. A second write mechanism on the phone: see Complexity Tracking. |

Additional Constraints: one running timer (a refused start says so), client
ids (`UUID` v7 per press, as `uuidv7()` makes), no new fixed cost.

## Project Structure

```text
apps/mobile/src/surfaces-native.ts           # iOS draws too; the press's backend and words
apps/mobile/src/session.ts                   # a refresh reads the stored session first
apps/mobile/app.config.ts                    # the targets, Live Activities, no push entitlement on iOS
apps/mobile/modules/stint-surfaces/ios/      # Swift: draw, the Live Activity, the press
apps/mobile/targets/widget/                  # the widgets, the Live Activity's views, the control
apps/mobile/targets/widget/_shared/          # App Intents and App Shortcuts, in the app too
apps/mobile/src/config.ts, metro.config.cjs  # Stint Local reaches the local stack through Metro
apps/mobile/eas.json                         # the `simulator` profile
docs/mobile.md                               # Outside the app
```

## What it removes

- `APPLE_TEAM_ID`'s explicit keychain group in `src/storage.ts` and
  `extra.appleTeamId`: an item lands in the app's first keychain group, the
  shared one, signed with any team or none.
- The `aps-environment` entitlement on iOS, which nothing used.
- No test: the surfaces' tests cover JS, which Android and iOS share, and
  iOS adds one case each where its behavior is new.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| VI: the phone's iOS presses outside the app go through Swift, not `useOptimisticMutation` | iOS runs the intent in a background launch with no scene, and Expo SDK 58 starts React Native only in `SceneDelegate`, so no JS runs | Opening the app for each press (`openAppWhenRun`) defeats the issue; a press in the widget's own process could not end the Live Activity, which only the app may change |
| V: the Swift press has no automated test | The repo has no iOS Swift suite, and no Xcode to run one; adding a suite changes the constitution's table | Kept to the HTTP call and the choice between `pressed` and the failure, both decided in tested JS; seen on EAS Simulator |
