# Implementation Plan: Every press answers at once

**Branch**: `f127-instant-feedback` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-instant-feedback/spec.md`

## Summary

Every mutating press answers in the same frame. Two modes, one shared
mechanism per platform. **Predicted mode** (timer start/stop/rename/resume,
inbox actions, invoice-paid marking, client/payment-profile edits, calendar
drag): the screen shows the predicted result immediately via TanStack
Query's `onMutate` optimistic-update path, rolling back to the prior cache
value with a stated reason on rejection or a 10s timeout. **Pending mode**
(invoice generation, sending an invoice, anything that moves money): the
pressed control shows an immediate in-progress state with no predicted
data, resolving when the server answers. Both modes are exposed by one web
helper (`useOptimisticMutation` in `apps/web/src/lib/client/mutations.ts`)
that wraps `useMutation`; a lint script (`check-mutation-usage.mjs`, same
shape as the existing `check-type-roles.mjs`) fails CI on any `useMutation`
import outside that module. macOS gets the same two modes via one
`OptimisticAction` protocol that `TimerModel` conforms to, replacing its
current do/await/catch action bodies; a checklist item at
`docs/CLAUDE.md`'s review gate is the non-automatable half. Web navigation
gets `loading.tsx` boundaries per route segment plus `router.prefetch()` on
tab hover/mount, using Next's own primitives rather than a new mechanism.

## Technical Context

**Language/Version**: TypeScript 6.x (Next.js 16 App Router), Swift 5.9
(macOS, `@Observable`)

**Primary Dependencies**: `@tanstack/react-query` v5 (already the only
client data layer — `apps/web/src/lib/client/use-timer.ts` and 20+ other
call sites), Next.js App Router `loading.tsx` + `router.prefetch()`, no new
package on either platform.

**Storage**: No schema change. This feature is entirely client-side
prediction/reconciliation against the existing `/api/v1/*` responses.

**Testing**: Vitest UI project (`pnpm test:ui`) for the mutation helper's
rollback/timeout/supersession behavior; `*.stories.tsx` per changed screen
state (Constitution V); a Swift unit test for `OptimisticAction`'s
rollback/timeout behavior in `apps/macos/Tests`; `apps/web/e2e` extended
with one Playwright scenario using route-level latency injection for
SC-001/SC-003 (start, rename-then-stop race, stale-summary race).

**Target Platform**: Web (Next.js) and macOS menu bar app. Both already
exist; no new platform.

**Project Type**: Web application + native macOS client, per
`docs/architecture.md`.

**Performance Goals**: Predicted result renders within the same frame as
the triggering event handler (no `await` before the first state update) —
this is a code-shape constraint (FR-001), not a measured latency budget,
since the whole point is independence from server latency.

**Constraints**: No opt-out from the shared mechanism on either platform
(FR-005/FR-006/FR-009). 10s rollback timeout (FR-013). Latest-press-wins
supersession per entity (FR-008/FR-014). No new fixed cost or dependency —
TanStack Query and Next's router already provide the two primitives used.

**Scale/Scope**: Every existing mutation call site across
`apps/web/src/lib/client/*.ts` and `apps/web/src/components/*.tsx` (timer,
inbox, invoices, clients, payment profiles, calendar), plus `TimerModel`'s
four action methods (`toggle`, `resume`, `rename`, `patch`) on macOS.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | Predicted mode shows a prediction, not a silent write — a rejection rolls back **visibly with a reason** (FR-002), never a quiet correction. The inbox's own suspect-record surfacing is untouched; predicted mode only changes how fast the inbox *reflects a user's own action* on it. |
| II. Logic written twice has a parity test | No | Nothing here is expressed twice in TS and SQL — the helper and its rollback logic are client-only. |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Predicted state is display-only; every mutation still calls the same `/api/v1/*` route it does today, and the server's response is what `onSuccess`/`onError` reconciles to. `startedAt` is stamped client-side for display (FR-012) but the server's own `started_at` remains authoritative on reconcile — the plan changes *what shows first*, never *who wins*. |
| IV. `packages/core` does no I/O | Yes | The mutation helper lives in `apps/web/src/lib/client/`, not `packages/core` — it's a client-only concern (TanStack Query itself is I/O). No change to `packages/core`. |
| V. Tests first, one suite per kind of code | Yes | Helper behavior → `apps/web/test/ui` (Vitest); each changed screen state → its `.stories.tsx`; the two #118 races → `apps/web/e2e`; `OptimisticAction` → a Swift XCTest. |
| VI. Every press answers in the same frame | Yes | This principle is *introduced by* this plan (see Constitution amendment below) — the feature is its own compliance case. |

Also check the design against the constitution's Additional Constraints. A
principle the design must break goes in Complexity Tracking.

- **One running timer per user**: unaffected — predicted mode changes
  display timing, not what gets written; the DB index still governs.
- **Online-only**: unaffected.

**Gate result**: PASS. No principle is violated.

### Post-Phase-1 re-check

| Principle | Result after design |
| --- | --- |
| I. Never silently modifies | Confirmed — `data-model.md`'s `MutationState` always carries a `rollbackReason` field populated before the visible revert; nothing reverts silently. |
| III. Server owns timer truth | Confirmed — `contracts/optimistic-mutation.md` specifies `onMutate` never writes to any field the server treats as authoritative beyond what's already client-displayed; reconciliation always takes the server's payload verbatim. |
| V. Tests first | Confirmed — `quickstart.md` enumerates the exact scenarios each suite covers, mapped 1:1 to spec Acceptance Scenarios. |

**Gate result (post-design)**: PASS, unchanged. No Complexity Tracking entry
needed.

## Constitution amendment

This feature adds a **new principle** (MINOR bump, 7.0.0 → 7.1.0) recording
responsiveness as a standing constraint per FR-010 — not a one-time fix for
this branch. Applied directly to `.specify/memory/constitution.md` as part
of this plan's commit:

> ### VI. Every press answers in the same frame
>
> A predictable, reversible action shows its predicted result before the
> server responds; an unpredictable or irreversible one shows an immediate
> pending state instead. Never neither. Both modes go through the one
> shared mechanism per platform — the web helper
> (`apps/web/src/lib/client/mutations.ts`) or the macOS `OptimisticAction`
> protocol — enforced with no opt-out: a lint check on web, a
> compiler-enforced conformance shape plus review checklist item on macOS.

## Project Structure

### Documentation (this feature)

```text
specs/002-instant-feedback/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/src/lib/client/
├── mutations.ts              # NEW — useOptimisticMutation (predicted + pending modes)
├── use-timer.ts              # start/stop/update rewritten onto the helper
├── use-calendar.ts           # drag rewritten onto the helper (predicted)
└── query-keys.ts             # unchanged — helper reuses invalidateEntryData

apps/web/src/components/
├── inbox.tsx                 # actions -> helper (predicted)
├── invoice-detail.tsx        # mark-paid -> predicted; generate/send -> pending
├── invoice-new.tsx           # generate -> pending
├── client-form.tsx, edit-client.tsx        # edits -> predicted
├── payment-profile-dialog.tsx              # edits -> predicted
└── calendar.tsx               # drag -> predicted, live-follow (FR-015)

apps/web/scripts/
└── check-mutation-usage.mjs  # NEW — lint, same shape as check-type-roles.mjs

apps/web/src/app/(app)/**/loading.tsx   # NEW per route segment lacking one (FR-007)

apps/web/test/ui/mutations.test.ts      # NEW — rollback, timeout, supersession
apps/web/e2e/instant-feedback.spec.ts   # NEW — #118 races at injected latency

apps/macos/Sources/Stint/
├── OptimisticAction.swift    # NEW — shared protocol (predicted + pending)
└── TimerModel.swift          # toggle/resume/rename/patch conform to it

apps/macos/Tests/
└── OptimisticActionTests.swift   # NEW

docs/design/principles.md      # note the standing responsiveness principle
.specify/memory/constitution.md  # Principle VI added (this plan's commit)
```

**Structure Decision**: Extends the existing `apps/web` + `apps/macos`
structure; no new project. One new web module
(`lib/client/mutations.ts`) is the single seam FR-005 requires; one new
Swift file (`OptimisticAction.swift`) is FR-006's equivalent. Both are
additive — existing components are rewired onto them, not restructured.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
