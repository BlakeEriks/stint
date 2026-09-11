# ADR 0002 — Next.js, but API-first (no Server Actions)

**Status:** accepted · **Date:** 2026-09-11

## Context

Three clients: web, Expo, native Swift. Only one is a browser.

Candidates evaluated: Next.js App Router, TanStack Start, React Router 7,
Vite SPA + Hono, SvelteKit.

## Decision

Next.js App Router, architected **API-first**. Every client — including the web
app — talks to `/api/v1/*` Route Handlers. **Server Actions are not used** for
anything mobile or desktop also needs.

## Rationale

The framework question matters less than it appears: three clients force a
clean HTTP API regardless of choice, so the framework becomes mostly a client
shell. Given that, switching costs weeks and buys nearly nothing.

- **Next.js** — already the stack in use. Route Handlers are Web-standard
  `Request → Response`, which *is* the shared API. Best-supported Vercel target.
- **TanStack Start** — genuinely the best technical fit (client-first data
  story, SPA-friendly), but still v1-RC in 2026. Wrong risk for a solo product.
  Revisit in a year.
- **Vite + Hono** — architecturally cleanest, and the honest version of what
  API-first Next.js becomes. Costs a migration; pick it only if RSC becomes a
  persistent fight.
- **React Router 7/8** — stable but a moving target, no advantage here.
- **SvelteKit** — disqualified by the Expo requirement: Svelte components
  cannot be shared with React Native.

**Plain REST + Zod, not tRPC** — tRPC's types cannot cross into Swift. An
OpenAPI spec generated from the Zod schemas keeps the Swift models honest.

## Consequences

- Server Actions are dead weight; RSC is confined to marketing/static pages.
- The app shell renders as client components over a TanStack Query cache, so
  navigation does not double-fetch against the local store.
- Two routers (Next for navigation, Query for data) — a known boundary to watch.
- Swift models are hand-written, kept honest by the generated OpenAPI spec.
