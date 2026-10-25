# Research: A phone timer

## One timer implementation, shared

- **Decision**: `packages/client` holds `useOptimisticMutation`, the query
  keys, `ApiError`, the response types and `useTimer`. `useTimer(api)` takes
  the four calls it makes (`summary`, `startTimer`, `stopTimer`,
  `updateRunning`); the web binds its own `api`, the phone its own.
- **Rationale**: the issue asks for one mechanism; `useTimer`'s skew
  correction, serial lane and `?include=` settling are the part most likely
  to drift if copied.
- **Alternatives**: moving all of `api.ts` (rejected: PDF, CSV and billing
  calls are web-only); a third timer hook in mobile (rejected: a copy).

## One React

- **Decision**: the phone uses React 19.3.1, the web's version, although
  Expo 58 lists 19.3.0.
- **Rationale**: `@stint/client` imports React and React Query from its own
  `node_modules`; with one version pnpm links one copy, so both apps share
  the instance their providers use. React Native 0.88's renderer has no
  exact-version check (checked in its `ReactFabric` build).
- **Alternatives**: Metro and Next aliases forcing resolution per app
  (rejected: two configs to keep in step).

## Sign-in and session

- **Decision**: GoTrue over `fetch`, as macOS does: `/otp` with
  `create_user: false`, `/verify` with `type: "email"`, refresh with
  `grant_type=refresh_token`, one in-flight refresh shared. Only a refresh
  GoTrue answers with 400 or 401 signs out. Preview builds sign in with the
  seeded password on launch.
- **Storage**: `expo-secure-store`. On iOS it uses a keychain access group
  (`<team>.dev.stint.shared`) once the Apple team exists, so #464's widgets
  read the same session; on Android a widget runs in the app's own process.

## Seeing it

- **Decision**: builders run the Expo web render against the worktree's
  web server; Metro proxies `/api/v1` to it, so the page needs no CORS.
  The owner installs a PR's EAS Android build on their Pixel 9.
- **Screens**: presentational components with `*.stories.tsx`, rendered in
  Chromium by `@storybook/react-native-web-vite` through the same
  portable-stories runner as the web.

## Preview builds

- **Decision**: `mobile-preview.yml` runs on a PR that changes the app or
  the packages it imports. It writes the PR's number, preview origin and
  Vercel bypass into the `preview` profile's `env` in `eas.json` on the
  runner, runs `eas build -p android --profile preview --wait`, and
  comments the install link. The APK installs as `dev.stint.mobile.preview`
  beside the released app.
- **Rationale**: EAS reads a profile's `env` from the local `eas.json`, and
  a cloud build sees nothing else from the runner's shell.
- **Needs the owner once**: an Expo account and project, and the
  `EXPO_TOKEN`, `EAS_PROJECT_ID` and `VERCEL_BYPASS` settings
  (`docs/mobile.md`).

## Left for later issues

- Push (#463) registers a device after sign-in, in the signed-in root;
  nothing here stubs it.
- Widgets, Live Activity and the iOS build itself (#464) wait on the Apple
  Developer Program (#460).
