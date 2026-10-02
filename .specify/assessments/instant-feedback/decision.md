# Decision: Every press answers at once

- **Slug**: instant-feedback
- **Decided**: 2026-09-28
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | strong | Real, reproduced pattern (no `onMutate` anywhere on web; macOS `toggle()`/`resume()` await-then-refresh), tied to a filed issue (#11) and a prior closed PR (#118) that tried and incompletely fixed it. |
| Evidence strength | strong | Every claim is cited to file:line (`use-timer.ts`, `TimerModel.swift`, route handlers, schema) or to `gh` issue/PR history; the one inference (tab-switch lag cause) is explicitly flagged as inference, not asserted as fact. |
| Value vs. inaction | adequate | Cost of inaction is concrete (piecemeal fixes repeat #118's failure mode); value is UX quality for a pre-Alpha, single-operator product — real but not urgent. |
| Feasibility / appetite | adequate | Option B has a credible, medium (weeks) appetite, adopts existing mechanisms (TanStack Query optimistic pattern, Next `loading.tsx`) per project guidance, and Blake has already resolved the one open design tension (predicted-green vs. "one green thing" rule). |
| Strategic fit | strong | Directly satisfies Principle "server owns timer truth" as written (governs which value wins, not which shows first) and the "adopt, don't hand-roll" rule; Blake's Option B choice confirms fit. |
| Risk posture | adequate | Main risks are named and have defensible mitigations: rollback-with-reason design is settled; `startedAt` client-stamp default is settled; Swift-side enforcement is honestly scoped down to a checklist/protocol convention rather than invented CI tooling under pressure. |

## Verdict & Rationale

Go. Problem validity and evidence strength both clear the bar with concrete, cited evidence rather than assumption — the rare case where research read actual code and prior PR history instead of inferring from a description. Blake has picked Option B and settled the one blocking design tension (predicted green shows immediately; server stays source of truth; rejection rolls back visibly with reason), so a go here hands `/speckit-specify` a shaped, non-ambiguous concept rather than an unshaped idea. Remaining unknowns (tab-switch lag's exact cause, Swift enforcement mechanism, in-flight-mutation-on-navigate behavior) are appetite/design details appropriately deferred to specify/plan, not blockers to starting — each already carries a stated defensible default in problem.md that specify can adopt or revisit.

## If go — Handoff to `/speckit-specify`

- **Problem**: Every user action across web and macOS only updates the screen after a server round trip (plus a full refetch on web), making the app feel laggy under production latency; no shared mechanism predicts the result at press time, and the one prior attempt (#118) fixed only part of one surface.
- **Chosen approach**: Option B — one shared optimistic-mutation helper per platform (web: TanStack Query `onMutate`/`onError`/`onSettled` wrapper; macOS: equivalent model-layer helper/protocol used by `TimerModel` including `resume`), applied to every mutation site found in research (timer start/stop/rename/resume, inbox, invoices, clients, payment profiles, calendar drag), plus route `loading.tsx`/prefetch for web tab switches, plus a constitution principle with an enforcement check.
- **In scope**: predicted timer start shows accent green immediately on press (server remains source of truth; rejection rolls back visibly with reason); one shared mechanism per platform covering all mutation sites listed above; web route loading boundaries + prefetch; constitution principle + enforcement check (lint on web, checklist/protocol convention on Swift); #118's two race tests (rename-after-stop, stale-refresh-after-press) as acceptance cases.
- **Out of scope**: redesigning the timer bar's visual language beyond the settled green behavior; predicting invoice generation's actual result (acknowledgment-only is accepted); optimizing query/render performance unrelated to missing loading boundaries; competitive/market framing; inventing a CI-enforced Swift lint equivalent (checklist/protocol convention is the accepted substitute pending a concrete design at plan stage).
- **Success metrics**: manual walkthrough of every mutation/listing/transition at ~1s and ~3s added latency shows predicted result or visible rollback-with-reason; #118's two race tests pass; a CI/lint check blocks a new web mutation that bypasses the shared helper, with an equivalent review gate on Swift; menu-bar "resume" shows predicted running state on press; web tab switches show a loading boundary or prefetched content instead of blank/stale render.
- **Carried-forward open questions** (each with the defensible default already recorded in problem.md, for specify/plan to adopt or revisit):
  - `startedAt` stamped client-side at press time for optimistic display; server's own value stays authoritative on reconciliation.
  - A predicted change left in-flight by navigation/quit continues and reconciles on return/relaunch (web: query cache + refetch; macOS: model refresh on next foreground).
  - Ship loading boundaries + prefetch first; measure remaining tab-switch lag before investing in query/render optimization.
  - Swift-side enforcement mechanism (checklist item + protocol/base-type convention) is a concrete-design gap for plan stage — no CI-equivalent exists yet.
  - Invoice generation and other unpredictable-result mutations get an immediate "in progress" acknowledgment on press, not a predicted result.
