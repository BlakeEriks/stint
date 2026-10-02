# Concept: Every press answers at once

- **Slug**: instant-feedback
- **Created**: 2026-09-28
- **Recommended option**: Option B — Shared optimistic-mutation helper + route loading boundaries

## Options

### Option A — Smallest thing that could work: fix the missed timer path only
- **Sketch**: Patch `TimerModel.resume(_:)` (macOS menu-bar restart) to show a predicted running state on press, matching what `toggle()` should already do; add `onMutate` to web's `useTimer` start/stop/rename. No shared helper, no other mutations, no loading boundaries.
- **Appetite**: small (days)
- **Trade-offs**: Wins fast closure of the one path #118 is known to have missed. Sacrifices everything else in the problem statement — inbox, invoices, clients, payment profiles, calendar drag, tab-switch lag all stay unfixed, and the next mutation added still won't be instant by default. Repeats #118's failure mode (per-surface patch) at smaller scope.
- **Rabbit holes**: none — that's the point and the limitation.

### Option B — Shared optimistic-mutation helper (web + macOS) + route loading boundaries
- **Sketch**: Build one TanStack Query wrapper on web (`onMutate` sets predicted state, `onError` rolls back with a visible reason, `onSettled` reconciles) and use it for every mutation site found in research: timer start/stop/rename/resume, inbox, invoices (acknowledgment only, no predicted result), clients, payment profiles, calendar drag. Build the macOS equivalent as a model-layer helper/protocol used by `TimerModel` (including `resume`). Add `loading.tsx` + prefetch to the web app's route segments so tab switches render immediately. Add a constitution principle plus a check (lint rule on web; review-checklist/protocol conformance on Swift) requiring new mutations to use the helper.
- **Appetite**: medium (weeks)
- **Trade-offs**: Wins full coverage of the stated goals and a mechanism that makes future mutations instant by default. Sacrifices speed — this touches ~19+ web mutation sites plus the Swift model layer, and the Swift-side "check" has no CI equivalent, only a checklist/protocol convention, which is weaker enforcement than web gets. Invoice generation gets acknowledgment-only treatment (no predicted result), an accepted gap per non-goals.
- **Rabbit holes**: (1) migrating 19+ existing web call sites without regressing any, especially ones with subtle server-shaped responses (invoice generation, payment profiles); (2) the Swift-side enforcement mechanism is genuinely unsolved — inventing one under time pressure risks either no real enforcement or over-engineering a lint-equivalent for a one-developer Swift codebase; (3) calendar drag and inbox may have UX-specific rollback presentation needs not yet designed; (4) determining tab-switch lag's real cause (loading boundary vs. data-fetch cost) is unmeasured — shipping boundaries first per the settled default risks masking a query that should be prefetched instead.

### Option C — Buy: adopt `useOptimistic`/router-level primitives wholesale, skip a custom helper
- **Sketch**: Lean entirely on React's built-in `useOptimistic` and Next's router-level prefetch/`loading.tsx` instead of a hand-rolled TanStack Query wrapper; on macOS, still need a custom model-layer mechanism since there's no off-the-shelf equivalent.
- **Appetite**: medium (weeks) — comparable to B, not smaller
- **Trade-offs**: Wins less custom code on the web half. Sacrifices the rollback-with-reason and reconciliation semantics TanStack Query's mutation cache already gives for free (in-flight status, retry, cache sync across components) — `useOptimistic` alone doesn't manage server reconciliation or cross-component cache consistency, so more custom glue would be needed than it first appears, and macOS still needs the same custom work as Option B. No real appetite advantage over B once the gap is filled; not a distinct enough win to prefer over B.
- **Rabbit holes**: same as B's (1)–(3), plus rebuilding cache-consistency behavior TanStack Query already provides.

## Recommendation

Option B. It's the only option that satisfies the problem's explicit goals (one shared mechanism per platform, covering every mutation site, plus loading boundaries) and directly follows the project guidance to adopt existing mechanisms (TanStack Query's documented optimistic-update pattern, Next's `loading.tsx`/prefetch) rather than hand-roll. Option A repeats #118's proven failure mode at smaller scope. Option C offers no real savings over B once macOS and reconciliation semantics are accounted for, and B's TanStack Query-based helper already **is** "adopt, don't hand-roll."

## Out of Scope (for the recommended option)

- Redesigning the timer bar's visual language beyond the settled predicted-green decision.
- Predicting invoice generation's actual result (number/PDF) — acknowledgment-only is accepted.
- Optimizing query/render performance unrelated to missing loading boundaries.
- Competitive/market framing (owned by `docs/positioning.md`).
- A CI-enforced Swift lint equivalent — a checklist/protocol-conformance convention is the accepted substitute pending a concrete mechanism at plan stage.

## Assumptions to Validate

- A predicted timer start shows green (accent) immediately on press; server remains source of truth; rejection rolls back visibly with reason (settled per Blake, 2026-09-28).
- `startedAt` is stamped client-side at press time for optimistic display; server's own value remains authoritative on reconciliation.
- A predicted change left in-flight by navigation/quit reconciles on return/relaunch (web: query cache + refetch; macOS: model refresh on next foreground) rather than being cancelled.
- Loading boundaries + prefetch are shipped first, before measuring whether remaining tab-switch lag is data-fetch/render cost rather than missing boundaries.
- Invoice generation and other unpredictable-result mutations get an immediate "in progress" acknowledgment on press, not a predicted result.
- The Swift-side "shared helper" enforcement mechanism (checklist item + protocol/base-type convention) is deferred to plan stage for a concrete design; no CI-equivalent check is assumed to exist yet.
