# Architecture

## What this is

A time tracker for solo contractors. The product thesis is **restraint**: one
active timer, clean logging, a calendar view, and invoicing. Toggl is the
comparison point, and it is expanding into project management — scope this app
deliberately does not want.

## Surfaces

| Surface | Stack | Scope | Status |
|---|---|---|---|
| Web | Next.js App Router, API-first | **All features.** The primary product. | API built, no UI |
| macOS | Native Swift menu bar app | Start / stop / view. Menu bar toggles between current timer and today's total. | **Not started** |
| iOS + Android | React Native (Expo) | Start / stop / view, light editing. | **Not started** |

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

## Offline

Local-first for **completed** entries; server-arbitrated for **starting** a timer.

- A running timer keeps ticking locally from its known `startedAt`, so the
  display never depends on the network.
- Completed entries, edits, clients and projects queue in an outbox and sync
  on reconnect. **The client-side outbox exists
  (`packages/core/src/outbox.ts`); the `POST /sync` handler does not yet.**
- Starting a timer requires the server, because that is the one operation with
  a global constraint.

### Why no sync engine

Deliberately not adopting ElectricSQL, PowerSync, Zero, Yjs, or Replicache.

- **The data model is the trivial case.** One user per dataset, a few dozen
  writes a day, no concurrent editors. Sync engines solve multi-user conflict
  resolution and partial replication of large shared datasets — neither problem
  exists here. Last-write-wins per entry is *correct*, not a compromise.
- **ElectricSQL is an operational risk** — acquired by Databricks (Aug 2026),
  Electric Cloud winding down.
- **Zero needs an always-on `zero-cache`** holding a persistent replication
  connection to Postgres, which destroys the cheap Vercel + Supabase posture.
- **Yjs / Replicache are the wrong shape** — CRDTs for collaborative editing.

The replacement is ~115 lines in `packages/core/src/outbox.ts`:
client-generated UUIDv7 (so retries are idempotent), an append-only queue,
and coalescing of redundant edits. The server half — `POST /api/v1/sync`
with a cursor — is **specified in `docs/api.md` but not implemented**; it is
only needed once a client that works offline exists.

Optional later polish: TanStack DB as the client store — it works over plain
REST with no sync engine. Its SQLite persistence was alpha as of 0.6, so treat
it as polish, not foundation.

## Auth

Supabase Auth. All three clients send the same JWT as a bearer token, and the
route handlers verify it identically.

- **Web** — `@supabase/ssr`, cookie-based sessions.
- **macOS** — `supabase-swift`, PKCE, Sign in with Apple via `signInWithIdToken`.
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
packages/core           duration, rates, timer, uuid, outbox, calendar,
                        invoice (line items), payment (details)
packages/design-tokens  tokens.json -> CSS + TS + Swift (generated into dist/)
packages/api-client     Typed fetch wrapper for web + Expo
apps/web                Next.js — the API layer; no UI yet
supabase/migrations     Schema, triggers, RLS
docs/design/samples     Committed renderer output (pnpm sample:invoice)
```

`apps/mobile` and `apps/macos` do not exist yet. `packages/design-tokens`
resolves through `dist/`, which is generated — run `pnpm tokens` before
anything imports it.

`packages/design-tokens` is a **build step, not a copy-paste**. One
`tokens.json` generates CSS custom properties, a TS object, and a Swift `Color`
extension, so the three clients cannot drift.
