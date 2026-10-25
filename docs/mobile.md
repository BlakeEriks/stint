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
email Mailpit caught. The native app needs a phone: see Preview builds.

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
production.

**No secret ships in a build or an update**, and a preview's links are public. Its
first launch asks for Vercel's Protection Bypass for Automation, the value
`pnpm try-mac` keeps in the Keychain, and keeps it in secure storage; every
PR's update, and the next build, finds it there. When Vercel
refuses it because it was rotated or mistyped, the app forgets it and asks
again.

## Sign-in

The macOS app's emailed six-digit code (`docs/macos.md`, Sign-in), over
`fetch` to GoTrue. **The session lives in secure storage**: the Keychain on
iOS, Keystore-encrypted storage on Android, one entry per backend host. On
iOS it uses the `dev.stint.shared` keychain access group once
`APPLE_TEAM_ID` is set, so the widgets can read it.

**Only GoTrue rejecting the refresh token signs out.** Offline, a timeout,
a 5xx or a rate limit keeps the session, and the screen says Stint can't be
reached.

## Preview builds

A PR's phone preview is an EAS Update, opened in one shared development
build of Stint Preview. The reviewer installs the build once, then scans
each PR's QR to open that PR, signed in as its seeded account.
`.github/workflows/mobile-preview.yml` publishes the update on every push
that changes the app or a package it imports, and comments the QR on the
PR.

The update carries the PR's number and Vercel preview; the build carries
neither (`fingerprint.config.cjs`). A build is made only when no finished
one has the push's fingerprint: main's native code changed, or the PR's
does. The PR's comment then links the new build to install.

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
