# Architecture

## Surfaces

| Surface | Stack | Scope |
|---|---|---|
| Web | Next.js App Router, API-first | The primary product. Every feature lands here first. |
| macOS | Native Swift menu bar app (`apps/macos`, SwiftPM, no Xcode) | The timer and nothing else: start, stop, task name, project. The menu bar toggles between the running timer and today's total. |
| iOS + Android | Expo app (`apps/mobile`) on the web's own client code (`packages/client`) | The macOS app's scope: start, stop, task name, project, with today's total and earnings. |

The scopes are ceilings: a native app does only what only it can do, and
neither is a port of the web. What's unbuilt lives in `feature` issues.

## The shape: a client shell over an HTTP API

A browser and a native app share one backend. That fact determines the
architecture:

- **No Server Actions** (constitution III). They are a form-mutation
  convenience a native client cannot call.
- Every client — including the web app — talks to `/api/v1/*` Route Handlers,
  which are plain Web-standard `Request → Response`.
- **All business logic lives behind that API.** Timer arbitration, rate
  resolution, and invoice numbering exist in exactly one place.
- RLS is enabled on every table as a safety net beneath the API, not as the
  primary access path.
- Plain **REST + Zod**, whose shapes Swift mirrors.

## The timer invariant

> At most one running time entry per user, enforced by a partial unique index
> (`docs/data-model.md`).

Timer state is **server-authoritative**. Opening the web app shows the timer
already running on the Mac, because the server is the source of truth. A
`POST /timer/start` while one is running returns `409 TIMER_ALREADY_RUNNING`
along with the running entry, so the client can display it.

Enforcing it in the **database** rather than in API code means no code path —
including one written later — can produce an overlap.

The cost is that starting a timer needs the network. A running timer keeps
ticking locally from its known `startedAt` — the client owns responsiveness,
the server owns truth — but nothing is queued while offline; see *Offline*
below. A client offers a start only while it shows no running timer. When
that view is stale, the start is predicted, its 409 takes the prediction
back, and the refetch shows what is running.

## Offline

The app is **online-only**, deliberately.

- A running timer keeps ticking locally from its known `startedAt`, so the
  display never depends on the network.
- Everything else — starting or stopping a timer, editing an entry, creating
  a client — needs the server.

## Auth

Supabase Auth. Every client sends the same JWT as a bearer token, and the
route handlers verify it identically.

- **Web** — `@supabase/ssr`, cookie-based sessions.
- **macOS and the phone** — an emailed **six-digit code**, typed into the
  panel or the phone's sign-in screen and verified in-process against
  GoTrue's `/verify` (`type: "email"`, digits in `token`), with the session
  in the Keychain on the Mac and in secure storage on the phone. A code rather than a link because a
  link has to cross from a browser into a different application: the clipboard
  carries a bearer credential, and a custom URL scheme is silently refused as
  a redirect target. `supabase-swift` is not used — the SDK is not needed to
  POST two endpoints. Sign in with Apple via `signInWithIdToken` would need a
  paid developer account, an App ID with the capability and a signed bundle,
  none of which a SwiftPM executable produces.

## Live updates

Local tick, reconcile on an interval and on wake/focus, and a push to the
phone and the browser.

The panel's readout counts seconds locally from the known `startedAt`, and the
menu bar shows whole minutes from the same tick, at no network cost. The Mac
app reconciles with `GET /api/v1/summary` roughly every 60s; the web and the
phone, every 10s while a timer runs and the app is in front, so a stop on
another device shows within one poll. `serverTime` in the response lets clients correct for clock skew.

An Android phone and the web app also hear of a change at once: every
change to the running timer, from any client, pushes the phone an FCM data
message and broadcasts to the user's private Realtime topic, `user:<id>`,
which the web app joins with its session. Each then refetches through
`/api/v1`; the poll stays for a dropped socket (`docs/mobile.md`, Push).

## Hosting

Vercel (Next.js + route handlers) and Supabase (Postgres, Auth, Storage).

- Invoice PDFs: `@react-pdf/renderer` — ~2MB, sub-500ms, no Chromium cold
  start. Puppeteer is only warranted if pixel-exact HTML fidelity is ever
  needed.
- Billing: Stripe's hosted Checkout and Customer Portal, per transaction
  with no fixed fee. Stripe sends the receipts and dunning mail; the webhook
  mirrors each subscription into `subscriptions` (`docs/api.md` §Billing).
- **Invite requests go to Formspree**, on its free plan: the landing page's
  form posts the visitor's email there, and invites go out from its list.
  No table and no route, since an unauthenticated write to our database
  would need rate limiting (`docs/deploying.md` sets it up).
- **No outbound mail**, so no provider and no domain in the stack. Invoices
  are downloaded and sent by the user (`docs/positioning.md`).

## Repo layout

```
packages/schema         Zod schemas — the API contract
packages/core           duration, rates, timer, uuid, calendar, grid
                        (drag-to-edit geometry), invoice (line items),
                        payment (details), billing (paid or free)
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
extension, so the clients cannot drift.
