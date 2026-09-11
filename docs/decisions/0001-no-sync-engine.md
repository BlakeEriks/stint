# ADR 0001 — No sync engine; hand-rolled outbox

**Status:** accepted · **Date:** 2026-09-11

## Context

The app needs offline-capable time entry across web, Expo and macOS.

## Decision

Build a small outbox queue (~115 lines as built). Do **not** adopt
ElectricSQL, PowerSync, Zero, Yjs, or Replicache.

## Rationale

- **This is the trivial case.** One user per dataset, a few dozen writes a day,
  no concurrent editors. Sync engines solve multi-user conflict resolution and
  partial replication of large shared datasets — neither problem exists here.
  Last-write-wins per entry is *correct*, not a compromise.
- **ElectricSQL is an operational risk** — acquired by Databricks (Aug 2026),
  Electric Cloud winding down; users must self-host or migrate.
- **Zero requires an always-on `zero-cache`** holding a persistent replication
  connection to Postgres — an always-running server component and a database
  that never idles, which defeats the cheap Vercel + Supabase posture.
- **Yjs / Replicache are the wrong shape** — CRDTs for collaborative editing.
- **TinyBase** is the closest lightweight option, but still means modeling data
  in its stores to replace ~115 lines.

## Consequences

- Own the sync logic, including the replay and coalescing edge cases.
- No vendor risk, no extra infrastructure, fully debuggable.
- Portable across all three clients (`packages/core/src/outbox.ts`).
- **Only the client half exists so far.** `POST /api/v1/sync` is specified in
  `docs/api.md` but unimplemented; it is not needed until a client that works
  offline exists.
- **Upgrade path preserved:** TanStack DB works over plain REST with no sync
  engine, and can later swap in a PowerSync/Electric adapter if this judgment
  turns out wrong.
