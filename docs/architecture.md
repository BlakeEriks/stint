# Architecture

## Surfaces

| Surface | Stack | Scope |
|---|---|---|
| Web | Next.js App Router, API-first | The primary product. Every feature lands here first. |
| macOS | Native Swift menu bar app (`apps/macos`, SwiftPM, no Xcode) | The timer and nothing else: start, stop, task name, project. The menu bar toggles between the running timer and today's total. |
| iOS + Android | React Native (Expo) | Start / stop / view, light editing. |

The scopes are ceilings: a native app does only what only it can do, and
neither is a port of the web. Web and macOS exist today; what's unbuilt lives
in `feature` issues.

## The shape: a client shell over an HTTP API

Three clients, only one of which is a browser. That single fact determines the
architecture:

- **Server Actions are not used** for anything mobile or desktop also needs.
  They are a form-mutation convenience that Swift and Expo cannot call.
- Every client — including the web app — talks to `/api/v1/*` Route Handlers,
  which are plain Web-standard `Request → Response`.
- **All business logic lives behind that API.** Timer arbitration, rate
  resolution, and invoice numbering exist in exactly one place.
- RLS is enabled on every table as a safety net beneath the API, not as the
  primary access path.
- Plain **REST + Zod**, whose shapes Swift can mirror. Nothing checks the
  Swift models against them yet (`TODO(#142)` in the
  constitution).

## The timer invariant

> At most one running time entry per user, enforced by a partial unique index
> (`docs/data-model.md`).

Timer state is **server-authoritative**. Opening the phone app shows the timer
already running on the Mac, because the server is the source of truth. A
`POST /timer/start` while one is running returns `409 TIMER_ALREADY_RUNNING`
along with the running entry, so the client can display it.

Enforcing it in the **database** rather than in API code means no code path —
including one written later — can produce an overlap.

The cost is that starting a timer needs the network. A running timer keeps
ticking locally from its known `startedAt` — the client owns responsiveness,
the server owns truth — but nothing is queued while offline; see *Offline*
below. Clients must treat 409 as a normal flow rather than an error state.

## Offline

The app is **online-only**, deliberately.

- A running timer keeps ticking locally from its known `startedAt`, so the
  display never depends on the network.
- Everything else — starting or stopping a timer, editing an entry, creating
  a client — needs the server.

## Auth

Supabase Auth. All three clients send the same JWT as a bearer token, and the
route handlers verify it identically.

- **Web** — `@supabase/ssr`, cookie-based sessions.
- **macOS** — an emailed **six-digit code**, typed into the panel and verified
  in-process against GoTrue's `/verify` (`type: "email"`, digits in `token`),
  with the session kept in the Keychain. A code rather than a link because a
  link has to cross from a browser into a different application: the clipboard
  carries a bearer credential, and a custom URL scheme is silently refused as
  a redirect target. `supabase-swift` is not used — the SDK is not needed to
  POST two endpoints. Sign in with Apple via `signInWithIdToken` would need a
  paid developer account, an App ID with the capability and a signed bundle,
  none of which a SwiftPM executable produces (#69).

## Live updates

Local tick, reconcile on an interval and on wake/focus.

The menu bar counts seconds locally from the known `startedAt` — always smooth,
zero network cost — and reconciles with `GET /api/v1/summary` roughly every
60s. `serverTime` in the response lets clients correct for clock skew.

Supabase Realtime can drop in later for instant cross-device updates without
any API change.

## Hosting

Vercel (Next.js + route handlers) and Supabase (Postgres, Auth, Storage).

- Invoice PDFs: `@react-pdf/renderer` — ~2MB, sub-500ms, no Chromium cold
  start. Puppeteer is only warranted if pixel-exact HTML fidelity is ever
  needed.
- **No outbound mail**, so no provider and no domain in the stack. Invoices
  are downloaded and sent by the user (`docs/positioning.md`).

## Repo layout

```
packages/schema         Zod schemas — the API contract
packages/core           duration, rates, timer, uuid, calendar, grid
                        (drag-to-edit geometry), invoice (line items),
                        payment (details)
packages/design-tokens  tokens.json -> CSS + TS + Swift (generated into dist/)
apps/web                Next.js — API routes and the web UI
supabase/migrations     Schema, triggers, RLS
docs/design/samples     Committed renderer output
                        (pnpm --filter @stint/web sample:invoice)
```

`packages/design-tokens` resolves through `dist/`, which is generated — run
`pnpm tokens` before anything imports it.

`packages/design-tokens` is a **build step, not a copy-paste**. One
`tokens.json` generates CSS custom properties, a TS object, and a Swift `Color`
extension, so the three clients cannot drift.
