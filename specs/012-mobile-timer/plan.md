# Implementation Plan: A phone timer for iPhone and Android

**Branch**: `f462-mobile-timer` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-mobile-timer/spec.md`

## Summary

A new Expo app, `apps/mobile`, holds the macOS panel's scope in the docked
layout the owner picked. It calls the web's own timer implementation: a
new package, `packages/client` (`@stint/client`), takes
`useOptimisticMutation`, the query keys, `ApiError`, the response types and
`useTimer` out of `apps/web`, and both apps import them. The web keeps its
cookie `request`; the phone has a bearer `request` that refreshes the
GoTrue session. Builders see the app as an Expo web render; the owner
installs each PR's EAS Android build from its Try it.

## Technical Context

**Language/Version**: TypeScript 6, React 19.3.1, React Native 0.88 on Expo SDK 58

**Primary Dependencies**: `@tanstack/react-query` 5 (shared with web),
`expo-secure-store`, `expo-font` with IBM Plex, `react-native-web` for the
web render, `react-native-get-random-values` for `uuidv7()`

**Storage**: the session in the phone's secure storage; `localStorage` in
the web render only

**Testing**: `apps/mobile/test` under `node --test` for the client logic;
the screens' `*.stories.tsx` rendered in Chromium through
`@storybook/react-native-web-vite`

**Target Platform**: Android and iOS phones; the web render for builders

**Project Type**: mobile app plus a shared client package

**Constraints**: online only; no paid service (EAS Build's free tier);
Constitution III and VI

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | The app writes only start and stop; a refusal is shown, never retried into a second entry. |
| II. Logic written twice has a parity test | No | Nothing is written in both SQL and TypeScript. The timer's client logic is moved, not copied. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | The phone reads and writes only `/api/v1`; the summary's answer replaces every prediction, refetched on each return to the foreground. |
| IV. `packages/core` does no I/O | Yes | Unchanged; `@stint/client` does no I/O of its own: each app supplies `request`. |
| V. Tests first where a regression is silent | Yes | Session refresh, sign-out and the bearer retry are tested first in `apps/mobile/test`; each screen state has a story. The table gains the mobile row. |
| VI. Every press answers in the same frame | Yes | Start and stop go through the shared `useOptimisticMutation` in the shared `useTimer`; the check that no file imports `useMutation` covers `apps/mobile` too. |

Additional Constraints: one running timer is the server's (a 409 shows what
runs); ids are `uuidv7()`; no new fixed cost (the Apple and Google fees are
#460's).

## Project Structure

### Documentation (this feature)

```text
specs/012-mobile-timer/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/mobile-build.md
├── design/timer.html, design/sign-in.html
└── tasks.md
```

### Source Code

```text
packages/client/src/         # NEW @stint/client: api-error, types, query-keys,
                             #   mutations, use-timer (moved from apps/web)
apps/web/src/lib/client/     # api.ts keeps request; use-timer.ts binds the web api
apps/mobile/                 # NEW Expo app
├── app.config.ts, eas.json, metro.config.js, index.ts
├── src/target.ts            # which backend a build talks to
├── src/session.ts           # GoTrue code sign-in, refresh, sign-out rule
├── src/request.ts           # bearer /api/v1 client, one retry after refresh
├── src/storage.ts(.web.ts)  # secure storage; localStorage in the web render
├── src/app/                 # root, providers, focus wiring
├── src/screens/             # SignIn, Timer (+ *.stories.tsx), presentational
└── test/                    # node --test client-logic suite
scripts/check-mutation-usage.mjs      # moved from apps/web/scripts, covers both apps
.github/workflows/ci.yml              # mobile tests, typecheck, stories
.github/workflows/mobile-preview.yml  # NEW: a PR's EAS Android build, link on the PR
docs/mobile.md                        # NEW, beside docs/macos.md
```

**Structure Decision**: one shared client package rather than copies, per
`.claude/rules/changes.md`. Web-only endpoints (PDF, CSV, billing) stay in
the web's `api.ts`; the phone defines the seven reads and writes it uses.

## Complexity Tracking

None. The constitution changes by PATCH (8.0.4): Principle VI's path moves
to `packages/client`, and Principle V's table gains the mobile row the
issue asks for.
