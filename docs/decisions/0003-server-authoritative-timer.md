# ADR 0003 — The timer is server-authoritative

**Status:** accepted · **Date:** 2026-09-11

## Context

"One active timer" is the product's organizing constraint. With four clients,
something must arbitrate. A purely local-first timer would let two devices each
believe they started one.

## Decision

Timer state lives on the server, enforced by a partial unique index:

```sql
create unique index one_running_timer_per_user
  on time_entries (user_id) where ended_at is null;
```

`POST /timer/start` while one is running returns `409 TIMER_ALREADY_RUNNING`
with the running entry attached.

## Rationale

Opening the phone should show the timer already running on the Mac. That is
only possible if the server holds the truth. Enforcing it in the **database**
rather than the API means no code path — including a future one — can produce
overlapping entries.

Overlap becomes structurally impossible rather than something to reconcile
later, which is what keeps invoices trustworthy.

## Consequences

- The timer is the one feature that is **not** fully offline-capable.
  *Starting* needs the network; a running timer keeps ticking locally from its
  known `startedAt`, and completed entries still queue offline.
- Clients must handle 409 as a normal flow, not an error state.
- `serverTime` is returned on timer reads so clients correct for clock skew.
