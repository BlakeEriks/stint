# Problem Definition: Every press answers at once

- **Slug**: instant-feedback
- **Created**: 2026-09-28
- **Inputs used**: intake.md, research.md

## Problem Statement

Across the web and macOS apps, the screen only reflects a user's action after a round trip to the server (plus, on web, a full refetch) — visible on every mutation and on tab switches in the web app — because no shared mechanism predicts the result at press time; this was invisible in local dev and surfaces only under production latency, and the one prior fix (#118) addressed a single surface and still missed a real path.

## Affected Users & Stakeholders

- **Users**: Blake, as the app's sole operator, dogfooding in production — feels start/stop, rename, inbox, invoice, client, payment-profile, and calendar-drag actions lag, and tab switches render stale/blank before data arrives.
- **Stakeholders**: Blake, also as product owner — decides scope and priority pre-Alpha; bears the cost of a second incomplete fix (per #118's precedent) and of constitution-level effort spent before outside users exist.

## Goals

- Every user action changes the screen in the same frame it is pressed, showing the expected result, not an in-between or stale state, while the server remains the source of truth.
- A rejected action rolls back visibly with the reason — never a silent revert.
- One shared mutation mechanism per platform (web: a shared TanStack Query optimistic-update helper; macOS: an equivalent in the model layer) so new mutations are instant by default, not fixed one at a time.
- The mechanism covers every mutation site found in research: timer start/stop/rename (including macOS menu-bar resume of a recent task), inbox, invoices, clients, payment profiles, calendar drag.
- Tab switching in the web app renders without waiting on the server round trip.
- Responsiveness becomes a constitution principle with a check that enforces it, so it does not regress mutation-by-mutation.
- #118's race tests (rename answering after stop; stale summary refresh landing after a press) pass as acceptance cases under the new mechanism.

## Non-Goals

- Redesigning the timer bar's visual language beyond what the settled green decision below requires.
- Solving invoice generation's predicted-result gap (a generated invoice number/PDF cannot be predicted client-side) — flagged as a known gap, not required to ship a predicted state.
- Measuring or fixing render/query-cost latency that is unrelated to missing loading boundaries (e.g., genuine data-fetch time) — the goal is to remove waiting that a predicted UI or a loading boundary can remove, not to optimize query performance itself.
- Competitive/market framing — owned by `docs/positioning.md`, not touched here.

## Success Metrics

- Manual walk-through of every mutation, listing, and screen transition at ~1s and ~3s of added latency (per issue #11) shows an immediate predicted result and, where rejected, a visible rollback with reason. (baseline: today, only `useTimer`'s summary query has anti-staleness overrides; every other mutation and listing shows stale/blank state for the full round trip.)
- #118's two race tests (rename-after-stop, stale-refresh-after-press) pass. (baseline: not currently exercised as acceptance cases.)
- A lint/CI check exists that fails a new web mutation not routed through the shared helper, and an equivalent review gate exists on the Swift side. (baseline: no such check exists on either platform.)
- Menu-bar "resume a recent task" shows a predicted running state on press. (baseline: `TimerModel.resume(_:)` awaits then refreshes with no predicted UI — the path #118 missed.)
- Tab switches in `apps/web/src/app/**` show a loading boundary or prefetched content instead of a blank/stale render. (baseline: no route has a `loading.tsx`; cause of lag is inferred, not measured.)

## Cost of Inaction

Production-only latency bugs stay structurally invisible in local dev and in the current test suite (issue #11's own title), so they will keep surfacing only after Blake notices the app "feels clunky" in real use, and each mutation will keep getting fixed piecemeal and incompletely — as #118 already demonstrated once, at the cost of a full PR cycle blocked twice on unrelated changes, then closed for missing a real path.

## Open Questions

- [SETTLED per Blake, 2026-09-28: a predicted timer start shows green (accent, running state) immediately on press, without waiting for the server; the server remains the source of truth, and a rejection rolls back visibly with the reason. This supersedes issue #11's "never claim green before the server confirms" and resolves the tension research flagged against `docs/design/screens/timer-bar.html`'s "only one green thing at a time" rule — that rule is not violated because a predicted start and a confirmed running state are never both shown as distinct elements at once, they are the same element.]
- [NEEDS CLARIFICATION: whether `startedAt` should be stamped client-side (so elapsed time is accurate from the press) rather than server-side as today — the schema already accepts a client value but no call site sends one. Most defensible default: stamp client-side at press time for the optimistic display, and let the server's own `started_at` (used if the client omits it) remain authoritative on reconciliation, since Principle "server owns timer truth" is about which value wins, not which value is shown first.]
- [NEEDS CLARIFICATION: what happens to a predicted change when the user navigates away or quits before the server answers. Most defensible default: the mutation continues in-flight and reconciles on return/relaunch (web: query cache + refetch; macOS: model refresh on next foreground), consistent with "server owns timer truth."]
- [NEEDS CLARIFICATION: how much of the tab-switch lag is missing loading boundaries versus data-fetch/render cost — research found this by inference (no `loading.tsx` anywhere, no RUM/profiling), not by measurement. Most defensible default: ship loading boundaries and prefetch first since they are cheap and non-regressive, then measure remaining lag before investing in query/render optimization.]
- [NEEDS CLARIFICATION: what a Swift-side equivalent of a "must use the shared mutation helper" lint check looks like — no existing CI/lint parallel was found. Most defensible default: a code-review checklist item plus a shared base type/protocol that makes the non-optimistic path visibly unusual, deferred to the shape/plan stage for a concrete mechanism.]
- [NEEDS CLARIFICATION: whether invoice generation and other mutations with no predictable client-side result (per research) need any UI treatment (e.g., a distinct "processing" state) or are exempt from the "predicted result" goal entirely. Most defensible default: exempt from predicting the *result*, but still get an immediate "in progress" acknowledgment on press rather than the current wait-with-no-feedback.]
