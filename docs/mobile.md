# The phone app

`apps/mobile` is an Expo app for iPhone and Android. **It is the timer and
nothing else**, the macOS panel's scope: start, stop, task name, project,
with Today, Earned, and five recent tasks. Each screen's look is its
`*.stories.tsx`.

**It calls the web's own timer.** `packages/client` (`@stint/client`) holds
`useTimer`, `useOptimisticMutation`, the query keys, `useFailedPress` and
the response types; the web and the phone each pass in their own `api`. The
web's sends its cookie; the phone's (`src/request.ts`) sends a bearer token
and refreshes the session once on a 401.

## Running it

Builders see it as an Expo web render, against the worktree's web server
and the local stack:

```bash
cd apps/mobile && STINT_APP_URL=http://localhost:<web port> pnpm web --port 8085
```

Metro passes `/api/v1` to the web server (`metro.config.cjs`), so the page
asks its own origin. Sign in as the seeded account: the code is in the
email Mailpit caught. The native app runs on a phone (see Preview builds)
or, on iPhone, in Xcode's Simulator, as the next paragraph says.

**The iPhone's native code is seen in Xcode's Simulator**, with
`npx expo run:ios`. Without Xcode, `eas build --platform ios --profile
simulator` builds Stint Local for a simulator in Expo's cloud, unsigned,
which shows it compiles. Loaded from Metro, a native Stint Local asks Metro
for `/api/v1` and `/auth/v1` too, which it passes to the web server and
Supabase, so a simulator or a phone on the LAN reaches the builder's
stack.

| Suite | Command |
| --- | --- |
| Session, requests, backends | `pnpm --filter @stint/mobile test` |
| Every screen state, in Chromium | `pnpm --filter @stint/mobile test:stories` |
| Types | `pnpm --filter @stint/mobile typecheck` |

## Which backend it talks to

`app.config.ts` reads `STINT_TARGET` at build time (`src/target.ts`), and
each target installs under its own id, beside the others:

| Target | App | Id | Talks to |
| --- | --- | --- | --- |
| `local` (default) | Stint Local | `dev.stint.mobile.local` | `STINT_APP_URL`, else `localhost:3100`, and the local stack |
| `preview` | Stint Preview | `dev.stint.mobile.preview` | one PR's Vercel preview and `stint-test`, signed in as `pr-<n>@preview.test` on launch |
| `prod` | Stint | `dev.stint.mobile` | production |

A preview's update needs `STINT_PREVIEW_PR` and `STINT_APP_URL`, and the
app refuses to start without them. The header names the target whenever it is not
production, and so does the icon. Stint Local's and Stint Preview's carry a
band in `warning`. `pnpm tokens` generates both icons into `assets/`.

**No secret ships in a build or an update**, and a preview's links are public. Its
first launch asks for Vercel's Protection Bypass for Automation, the value
`pnpm try-mac` keeps in the Keychain, and keeps it in secure storage; every
PR's update, and the next build, finds it there. When Vercel
refuses it because it was rotated or mistyped, the app forgets it and asks
again.

**Stint Preview is a development build, so it runs any bundle a deep link
names.** A crafted link opened on the reviewer's phone could read what it
keeps: the bypass, and a session on `stint-test`, whose data is seeded
test data. The answer to a leak is rotating the bypass in Vercel
(`docs/deploying.md` §3a); the app then asks for the new one.

## Sign-in

The macOS app's emailed six-digit code (`docs/macos.md`, Sign-in), over
`fetch` to GoTrue. **The session lives in secure storage**: the Keychain on
iOS, Keystore-encrypted storage on Android, one entry per backend host. On
iOS, a press outside the app refreshes it in Swift and stores the result; a
refresh in the app reads the stored session first and takes that one.

**Only GoTrue rejecting the refresh token signs out.** Offline, a timeout,
a 5xx or a rate limit keeps the session, and the screen says Stint can't be
reached.

## Push

**A timer changed on another client shows on Android at once.** Signed in,
the phone registers its FCM token (`POST /api/v1/push-devices`), with no
permission prompt, and unregisters it on sign-out. The server pushes a data
message on every change to the running timer (`docs/api.md`, Push
devices); the app refetches the timer unless one of its own presses is in
flight (`onTimerChanged` in `packages/client/src/query-keys.ts`). It also redraws [the timer outside the
app](#outside-the-app), even with the app closed. The iPhone waits on APNs (#471).

Preview and production builds need `GOOGLE_SERVICES_JSON`, an EAS file
variable holding Firebase's `google-services.json`: `eas-build-pre-install`
copies it into the app (`apps/mobile/scripts/google-services.mjs`), and a build without
it stops. A local build has no Firebase and never registers. The server
sends only with `FCM_SERVICE_ACCOUNT` (`docs/deploying.md`). Firebase,
once:

1. At console.firebase.google.com, add a project named `stint`, with
   Google Analytics off. FCM is free on the Spark plan.
2. Add an Android app for each id in [Which backend it talks
   to](#which-backend-it-talks-to) that should get pushes:
   `dev.stint.mobile.preview` and `dev.stint.mobile`. Download
   `google-services.json` after adding the last: it lists every app.
3. In `apps/mobile`: `npx eas-cli env:create --name GOOGLE_SERVICES_JSON
   --type file --value ./google-services.json --environment preview
   --environment production --visibility sensitive`, then delete the
   file.
4. Project settings → Service accounts → Generate new private key. Paste
   the whole JSON into Vercel as `FCM_SERVICE_ACCOUNT`, then delete the
   file.

## Outside the app

**On Android, the timer is seen and pressed without opening the app**: an
ongoing notification with a counting clock and Stop, a home screen widget
in a 4×1 row and a 2×2 square, a Quick Settings tile, and the icon's
long-press shortcut. `specs/014-android-surfaces/design/surfaces.html` is
their look; the widget has no story, since Android draws it from XML.

**JavaScript decides and Kotlin draws.** `src/surfaces.ts` turns the
cached timer into one state on every change and hands it to the local
module `modules/stint-surfaces`, which draws every surface from it and
keeps nothing of its own. A press there draws its result at once, then
WorkManager runs the `StintPress` task (`index.ts`): the app's own press,
`timerPresses` through `pressOnce` in `@stint/client`, in the same lane as
the app's Start and Stop. A refusal draws what the server holds, with the
reason. The shortcut opens a screen that isn't exported, so no other app or
link can press the timer; it presses as a widget does, then opens the app.

Start begins the most recent task on its project. A press from the lock
screen asks to unlock first. The app asks Android 13's notification
permission as soon as it opens signed in, since a timer started on the web
is pinned with the app closed. While notifications are off, the timer
screen says so, with a button to Settings.
Android 16 promotes it, and shows its clock in the status bar.

A local build has no push, so its surfaces follow only the app's own reads
and presses. The module is native code: a change to it needs a new build,
not an update.

**On iPhone, the same state draws a Live Activity** on the lock screen and
in the Dynamic Island, home screen widgets in Android's two layouts, two lock
screen widgets, and a Control Center control on iOS 18. Siri and Shortcuts
know Start and Stop, so the Action button runs one. All need iOS 17; the app
runs from 16.4 without them. `specs/015-ios-surfaces/spec.md`, Design, is
their look, and `targets/widget` their SwiftUI, added to the build by
`@bacons/apple-targets`.

**A press runs in the app, in Swift.** Each intent is a `LiveActivityIntent`,
which iOS runs in the app, launched in the background with no scene, where
React Native doesn't start. So `modules/stint-surfaces/ios` presses itself,
through the macOS app's `Optimistic`, symlinking the files of
`apps/macos/Sources/Stint/Shared`. It draws `pressed` at
once, calls `/api/v1` with the app's session, and once the last press
settles, draws the timer the server holds, with JS's words for a failure.
The app's JS refetches the timer when it next runs. The widget extension
only reads what the module stored, the keychain item `dev.stint.surfaces`.
Until #471, a timer started on another client reaches the iPhone's surfaces
only when the app next opens.

**A free Apple ID can sign it.** The build relies on keychain sharing alone:
no app group, no Siri capability, and no push entitlement, which
`app.config.ts` removes. Where keychain sharing isn't signed, the widgets
and the control say "Open Stint", and the Live Activity, Siri and Shortcuts
still work.

## Crash reporting

**Only a production build reports**, to Sentry's `stint-mobile` project:
crashes and errors nothing caught (`src/crash-reporting.ts`). It alone
carries the DSN, and its EAS build uploads source maps and debug symbols
when EAS holds `SENTRY_AUTH_TOKEN` (`docs/deploying.md` §3c). Production
takes no updates, so no over-the-air bundle needs its own upload.

## Preview builds

A PR's phone preview is an EAS Update, opened in one shared development
build of Stint Preview. The reviewer installs the build once, then scans
each PR's QR to open that PR, signed in as its seeded account.
`.github/workflows/mobile-preview.yml` publishes the update on every push
that changes the app or a package it imports, and comments the QR on the
PR.

The update carries the PR's number and Vercel preview; the build carries
neither (`fingerprint.config.cjs`). A build is made only when no finished
one has the push's fingerprint, or the one that does expires within a day
and its link would stop installing: main's native code changed, the PR's
does, or the build is about to expire. The PR's comment then links the
new build to install.

It needs, once:

1. An Expo account and a project named `stint`
   (`npx eas-cli init` in `apps/mobile`).
2. GitHub secret `EXPO_TOKEN` (expo.dev → Access tokens).
3. GitHub variables `EXPO_OWNER` (the Expo account or organization that owns the project) and `EAS_PROJECT_ID`.

## Releasing

From `main`, in `apps/mobile`, with `EAS_PROJECT_ID` and `EXPO_OWNER` set:

```bash
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --profile production
```

The submit reaches Play internal testing once the Play Console app exists
and EAS holds its service account key (`npx eas-cli credentials`). The
iPhone build and TestFlight need the Apple Developer Program, which
`docs/positioning.md` counts.
