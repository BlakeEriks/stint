# Architecture

## What this is

A time tracker for solo contractors. The product thesis is **restraint**: one
active timer, clean logging, a calendar view, and invoicing. Toggl is the
comparison point, and it is expanding into project management — scope this app
deliberately does not want.

## Surfaces

| Surface | Stack | Scope |
|---|---|---|
| Web | Next.js App Router, API-first | The primary product. Every feature lands here first. |
| macOS | Native Swift menu bar app (`apps/macos`, SwiftPM, no Xcode) | The timer and nothing else: start, stop, task name, project. The menu bar toggles between the running timer and today's total. |
| iOS + Android | React Native (Expo), `apps/mobile` | Start / stop / view, light editing. |

**Scope, not progress** — `tasks.md` is where unbuilt work lives, and a status
column here would be a second list that silently disagrees with it. What
exists on disk is the honest signal: `apps/mobile` has no directory.

Neither native app is a port, and neither should grow into one. The scopes
above are ceilings, not milestones.

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
- Plain **REST + Zod, not tRPC** — tRPC's types cannot cross into Swift. An
  OpenAPI spec generated from the Zod schemas keeps the Swift models honest.

### Why Next.js, and what was rejected

The framework question matters less than it appears: three clients force a
clean HTTP API regardless of the choice, so the framework becomes mostly a
client shell. Switching costs weeks and buys nearly nothing.

- **Next.js** *(chosen)* — already the stack in use. Route Handlers are
  Web-standard `Request → Response`, which *is* the shared API. Best-supported
  Vercel target.
- **TanStack Start** — genuinely the best technical fit (client-first data
  story, SPA-friendly), but still v1-RC in 2026. Wrong risk for a solo
  product. Worth revisiting in a year.
- **Vite + Hono** — architecturally cleanest, and the honest version of what
  API-first Next.js becomes. Costs a migration; pick it only if RSC turns into
  a persistent fight.
- **React Router 7/8** — stable, but a moving target with no advantage here.
- **SvelteKit** — disqualified by Expo: Svelte components cannot be shared with
  React Native.

Consequences accepted: Server Actions are dead weight and RSC is confined to
static pages; the app shell renders as client components over a TanStack Query
cache; two routers coexist (Next for navigation, Query for data), which is a
known boundary to watch.

## The timer invariant

> At most one running time entry per user, enforced by the database.

```sql
create unique index one_running_timer_per_user
  on time_entries (user_id) where ended_at is null;
```

Timer state is **server-authoritative**. Opening the phone app shows the timer
already running on the Mac, because the server is the source of truth. A
`POST /timer/start` while one is running returns `409 TIMER_ALREADY_RUNNING`
along with the running entry, so the client can display it.

This makes overlapping entries *structurally impossible* rather than something
to reconcile later — which is what keeps invoices trustworthy.

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

### Why there is no offline queue

There was one: ~115 lines in `packages/core/src/outbox.ts`, with `POST /sync`
specified as its server half. **Both were removed**, because nothing imported
the outbox but its own tests and the server half was never built. Code kept
for a need that has not arrived is still code that has to be read, understood
and maintained.

The case for offline is also narrower than it first looks:

- **Starting a timer can never be offline.** The server arbitrates the
  one-running-timer invariant; that is what makes overlap impossible.
- **A running timer already survives** a dropped connection without any
  queue, because it counts from `startedAt`.

What remains is stopping or editing an entry while disconnected — real, but
rare in a browser tab. It gets interesting on **mobile**, where the app is
opened specifically to stop a timer and there may be no signal. Revisit it
there, with evidence.

### If it comes back, still no sync engine

The research that ruled these out holds regardless, so it should not be
redone:

- **The data model is the trivial case.** One user per dataset, a few dozen
  writes a day, no concurrent editors. Sync engines solve multi-user conflict
  resolution and partial replication of large shared datasets — neither
  problem exists here. Last-write-wins per entry is *correct*, not a
  compromise.
- **ElectricSQL is an operational risk** — acquired by Databricks (Aug 2026),
  Electric Cloud winding down.
- **Zero needs an always-on `zero-cache`** holding a persistent replication
  connection to Postgres, which destroys the cheap Vercel + Supabase posture.
- **Yjs / Replicache are the wrong shape** — CRDTs for collaborative editing.
- **TinyBase** is the closest lightweight option, but still means modeling the
  data in its stores.

A small hand-rolled queue was the right shape, and rebuilding one is cheap.
TanStack DB is the escape hatch if that judgment ever proves wrong: it works
over plain REST today and can swap in a PowerSync or Electric adapter later.

## Auth

Supabase Auth. All three clients send the same JWT as a bearer token, and the
route handlers verify it identically.

- **Web** — `@supabase/ssr`, cookie-based sessions.
- **macOS** — the emailed link, verified in-process against GoTrue's
  `/verify` with `token_hash`, and the session kept in the Keychain.
  `supabase-swift` is not used: the SDK is not needed to POST two endpoints,
  and PKCE stores its verifier per origin, which is the collision documented
  in `CLAUDE.md` and worse when the link opens in a *browser* while the app
  holds the verifier. Sign in with Apple via `signInWithIdToken` remains the
  intended addition; it needs a paid developer account, an App ID with the
  capability and a signed bundle, none of which a SwiftPM executable
  produces.
- **Expo** — AsyncStorage session store. **`AppState` must be wired to
  `startAutoRefresh()` / `stopAutoRefresh()`**, or the refresh timer keeps
  firing while suspended and sessions go stale on resume. Easy to miss.

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
- **No outbound mail.** Invoices are downloaded and emailed by the user, so
  there is no provider, no domain reputation to maintain, and no deliverability
  failure mode where a client silently never receives an invoice.
- Note: Supabase free-tier projects pause after 7 days of inactivity.

## Repo layout

```
packages/schema         Zod schemas — the API contract
packages/core           duration, rates, timer, uuid, calendar, grid
                        (drag-to-edit geometry), invoice (line items),
                        payment (details)
packages/design-tokens  tokens.json -> CSS + TS + Swift (generated into dist/)
packages/api-client     Typed fetch wrapper for web + Expo
apps/web                Next.js — API routes and the web UI
supabase/migrations     Schema, triggers, RLS
docs/design/samples     Committed renderer output
                        (pnpm --filter @stint/web sample:invoice)
```

`apps/mobile` does not exist yet. `packages/design-tokens`
resolves through `dist/`, which is generated — run `pnpm tokens` before
anything imports it.

`packages/design-tokens` is a **build step, not a copy-paste**. One
`tokens.json` generates CSS custom properties, a TS object, and a Swift `Color`
extension, so the three clients cannot drift.
