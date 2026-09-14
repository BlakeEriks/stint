# Refactor candidates

Input for an architecture-review pass. Ranked by payoff. Each item states the
problem and the concrete files; none prescribe a solution.

Context that constrains any plan:

- The product thesis is restraint. Removing capability is a valid answer.
- Migrations are additive and forward-only. Schema fixes are two releases.
- Line items are frozen at generation; never recompute an issued invoice.
- `docs/` is authoritative and written a particular way — see `docs/CLAUDE.md`.

---

## 1. Rate resolution exists four times, not three

`CLAUDE.md` says three. There are four.

- `resolveRate()` — `packages/core/src/rates.ts`
- `resolve_entry_rate()` — `supabase/migrations/00000000000002_integrity.sql:110`
- inline coalesce — `supabase/migrations/00000000000007_unbilled_rollup.sql:26`
- inline coalesce — `supabase/migrations/00000000000008_month_revenue.sql:38`

All four are `entry override -> project -> client -> user default`. Nothing
checks that they agree, and both SQL copies carry a comment admitting it.

Worse: `resolve_entry_rate()` — the one named as the reference — has **no
callers**. The authoritative-sounding implementation is dead code while three
copies actually bill. A fix to the "canonical" one changes nothing.

This is a billing system. Divergence here misstates money on an invoice and
the home screen disagrees with the preview. Highest-value item on the list.

Worth deciding: is the SQL duplication removable (a shared SQL function the
rollups call), or is it inherent to set-based queries and the real fix a test
that asserts all four agree on a fixture matrix?

## 2. `packages/schema` is decorative — no route imports it

`packages/schema/src/index.ts:2` calls itself "The API contract. Single source
of truth." Only two files import it (`lib/errors.ts`, `lib/client/api.ts`), both
types-only. **All 20 route handlers re-declare their Zod schemas inline.**

The drift is already live and two cases are bugs:

- **Settings thresholds are unsettable.** `UpdateSettings`
  (`api/v1/settings/route.ts:40`) omits `minEntrySeconds` and `maxEntryHours`,
  but `SETTINGS_FIELDS` (`rows.ts:146-147`) maps them and `stats/route.ts:376`
  reads them to drive the inbox's strange-duration rows. Zod strips unknown
  keys, so a PATCH carrying them returns **200 and silently discards them**.
  A documented feature is unreachable, and nothing errors.
- **The API accepts money it forbids.** Route `CreateClient`
  (`clients/route.ts:66`) uses `z.number().nonnegative()`; the contract's
  `money` adds `.multipleOf(0.01)`. `$10.005` rates enter a billing system.
- Route `CreateClient` also has **no `paymentProfileId`**, though the schema
  has it, `rows.ts` maps it, and the column exists — unsettable at creation.

This is the root cause of items 1, 3 and 7: there is no compile-time link
between contract, validation and row mapping, so every pairing drifts silently.
Making the schema load-bearing closes the settings hole *by construction*.

## 3. The DB→API boundary is untyped

`apps/web/src/lib/rows.ts` calls itself "the single boundary" and "if a field
is renamed, it is renamed here." Neither holds.

- Four of five converters take `Record<string, any>` (`toClient:45`,
  `toProject:65`, `toSettings:79`, `toPaymentProfile:168`). Only `toEntry`
  has a real row interface. A renamed column type-checks clean and returns
  `undefined` at runtime.
- Each converter is paired with a hand-maintained `*_COLUMNS` string literal
  that must stay in sync with it by eye. `SETTINGS_COLUMNS` lists 18 columns.
- `apps/web/src/lib/invoicing.ts` is a **second** boundary — `toInvoice:192`
  and `toLineItem:218`, both `Record<string, any>` — because the PDF loader
  needs shapes `rows.ts` does not model. A change to invoice fields means
  editing both files, and nothing fails if you edit one.

Ten `as Record<string, any>` casts across the payment-profile routes launder
rows past the type system entirely.

The fix is probably generated row types from the schema, but the tradeoff
against build complexity is the thing to weigh.

## 4. The row-exit animation — seven mechanisms for one fade

The single most expensive complexity in the app, and all of it exists so a
dealt-with inbox row plays an exit before it unmounts. The root cause is that
every action calls `invalidateQueries`, and the refetch drops the row before
anything can animate — so each piece below buys back a fact the refetch
destroyed:

- `useLeaving()` — `lib/client/use-leaving.ts`, two parallel `Set`s and a
  five-verb API (`leave`/`hold`/`release`/`settle` + derived `keeping`). The
  two Sets are mutually exclusive states of one id.
- `seen` ref — `inbox.tsx:95`, a `Map` of every row ever rendered, to supply
  data the query no longer returns.
- `PlacedRow.after` — `inbox.tsx:40`, a linked-list pointer splicing departing
  rows back in by predecessor id.
- `pinHeight` — `inbox.tsx:606`, a ref callback writing measured
  `getBoundingClientRect().height` onto the `<li>` because keyframes cannot
  interpolate from `auto`.
- A 400ms `setTimeout` bail — `inbox.tsx:617`, because `animationend` does not
  fire in jsdom. Test infrastructure leaking into production.
- `retiringRunaway` — `inbox.tsx:77`, a whole parallel path because the runaway
  row comes from the timer and has no id.
- **`EntryDialog.settle()` — `entry-dialog.tsx:127-155`.** A
  `MutationObserver` on the entire `document.body` subtree, with a
  re-entrancy latch and a 1000ms timeout, **deliberately outliving the
  component that created it**, watching for a `[data-slot="dialog-overlay"]`
  element to leave the DOM. It keys off an internal shadcn attribute, so a
  shadcn upgrade silently degrades it to the timeout path. Its only purpose is
  to fire this hook's `onClosed`.

Each piece is individually well-argued in a comment. The question for review is
whether the behaviour is worth the total, and whether the real fix is upstream:
don't invalidate-then-animate. A CSS `@starting-style` fade or View Transitions
gets most of it in a few lines; accepting instant removal gets it in zero. For
a solo-contractor tracker, a row vanishing when you click "Mark paid" is not
obviously a defect.

Removing it would delete the hook, ~120 lines of `inbox.tsx`, the
`onSaved`/`onClosed` two-beat protocol, and all fifty lines of `settle`.
`use-leaving.ts` is uncommitted, so it is the cheapest point of entry.

## 5. `stats/route.ts` — 504-line route handler

`apps/web/src/app/api/v1/stats/route.ts` does query parsing, six pure
business-logic builders (`buildUnprojected`, strange-duration detection, pace,
etc.) with their own row interfaces, and response shaping — in one file.

The builders are pure and testable and belong in `packages/core`, which is
where comparable logic (`invoice.ts`, `grid.ts`, `calendar.ts`) already lives.
As written they are reachable only through an HTTP handler.

This is also the widest surface feeding the home screen and the dock, so it is
the file most likely to keep growing.

## 6. Over-documentation: the same history retold in five files

The house style explains *why*, which is right and worth keeping. The debt is
narrative, not litter — there is essentially no commented-out code and **zero**
`TODO`/`FIXME`/`HACK` markers in the whole tree. The failure mode is
changelog-in-comments.

**The dominant pattern.** One migration — the timer moving out of the nav into
a docked bar — is retold in at least five files: `nav-timer.tsx`,
`timer-bar.tsx`, `dock.tsx`, `home.tsx`, `home-cards.tsx`. `timer-bar.tsx`
quotes an argument from `nav-timer.tsx` in order to rebut it. This is a
`docs/design/principles.md` entry that got scattered across the components it
was about, and it will be retold a sixth time unless it lands somewhere.

**Essays on dead code.** Two of the worst offenders are unreachable:

- `nav-timer.tsx` — 16-line header, zero references. The comment preserves a
  rebuttal to itself ("it was wrong in an instructive way").
- `activity-strip.tsx` — 23-line header, unreferenced. Kept alive by a comment
  in `home-cards.tsx:18-41` arguing for its retention, so two files carry prose
  for code nothing calls.

`tasks.md` already carries their removal. Deleting them deletes ~40 lines of
comment for free and removes two tellings of the story above.

**Worst ratios on live code:**

| File | Comment/code | Problem |
|---|---|---|
| `app/(app)/throw/page.tsx` | 18/6 (66%) | A dev-only throwing stub explained at the length of an ADR |
| `lib/client/format.ts` | 9/14 (64%) | 9-line header on a one-line `Intl.NumberFormat` wrapper, mostly narrating a fixed bug |
| `components/wordmark.tsx` | 16/29 (55%) | Brand philosophy above three `<span>`s |
| `lib/client/use-media-query.ts` | 18/33 (54%) | 18-line block over a 9-line hook |
| `components/dock.tsx` | 32/62 (51%) | Product history + a paragraph on what deliberately is *not* here |
| `components/page.tsx` | 52/136 (38%) | `DetailPage`'s header documents a known bug and its unimplemented fix — a TODO pile in prose |
| `app/(app)/invoices/page.tsx`, `clients/page.tsx` | 14 and 9 lines | Near-verbatim duplicated prose over identical 7-line `<Suspense>` wrappers |

The test from `docs/CLAUDE.md` transfers: a comment earns its place only if the
code cannot show it and CI cannot enforce it. History of a rejected design
belongs in `principles.md`, which is already the place for "decided against."

Explicitly **not** on this list, despite high density: `packages/core/src/grid.ts`
(51%), `calendar.ts`, `lib/auth.ts` (43%), `lib/client/use-theme.ts` (48%).
Those document real DST, RLS and hydration traps that would otherwise be
reintroduced. Density is not the signal; subject matter is.

## 7. Swift models have already drifted, and CI never compiles them

`apps/macos/Sources/Stint/API.swift` hand-writes seven `Codable` structs and
says so plainly: "Hand-written and unchecked against `packages/schema`."

It has already drifted. Swift's `TimeEntry` omits `durationOk` and
`rateOverride`; `Project` omits `hourlyRate` and `isBillableDefault`; `Client`
decodes only `id` and `color` — pinning the macOS app to `projects.color`-era
assumptions, a column `CLAUDE.md` calls dead.

It also mirrors **`rows.ts`**, not `packages/schema` — coupling the client to
the internal DB-mapping layer rather than the published contract.

And there is **no CI job touching Swift at all** — no workflow references
`swift` or `macos`. The models are not compiled in CI, let alone checked.

`docs/architecture.md` already wants OpenAPI generated from the Zod schemas for
exactly this. Worth costing: generated Swift, versus a contract test decoding
real fixtures, versus accepting the risk for a panel touching five endpoints.
Cheapest immediate win is simply compiling it in CI.

## 8. Formatting and DST helpers duplicated

**Formatting across the PDF boundary.** Currency is built twice
(`lib/client/format.ts:11`, `lib/invoice-pdf.tsx:233`) and
`quantityHours.toFixed(2)` is inlined in `invoice-detail.tsx:118`,
`invoice-new.tsx:282`, `invoice-pdf.tsx:345`. The preview a user approves and
the PDF that issues format numbers through different code.
`packages/core/src/invoice.ts` exists precisely so preview and generation share
construction; formatting never got the same treatment.

**The DST logic has the same disease as the rates.** `localDateKey` is exported
from core and used correctly in two places — while **five** files hand-roll the
same `Intl.DateTimeFormat('en-CA')`: `stats/route.ts:482`,
`entry-dialog.tsx:451`, `activity-chart.tsx:271`, `calendar.tsx:447`,
`activity-strip.tsx:155`. Separately, `toInstant` (`entry-dialog.tsx:444-503`)
and `startOfLocalDate` (`core/calendar.ts`) are the same "guess UTC, correct by
the offset the guess lands in" algorithm written twice with near-identical
comments, and `nextDate` (`invoicing.ts:12`) duplicates `addDays`
(`entry-dialog.tsx:498`) verbatim — `addDays` even takes an unused first
parameter.

This is the rate-resolution failure mode reproduced in the date logic, which
`CLAUDE.md` correctly identifies as the most trap-laden code in the repo.

## 9. Cache invalidation is hand-copied, and already wrong

The list `['summary'], ['entries'], ['stats'], ['calendar']` is retyped at six
call sites in varying order. **`use-timer.ts:114` invalidates only two of the
four** — so stopping a timer leaves `stats` and `calendar` stale, and the dock
and calendar keep showing pre-stop figures until something else refetches.

Query keys compound it: `['clients', 'withArchived']` and
`['clients', { archived: true }]` are different cache entries for overlapping
data, and `['stats']` vs `['stats', tz]` coexist. 31 hand-written
`invalidateQueries` calls, one named constant among them.

A key factory plus one `invalidateEntryData()` removes the drift and fixes the
`use-timer` bug as a side effect.

## 10. `packages/api-client` is a 166-line package with zero consumers

Nothing imports `@stint/api-client`. `apps/web/src/lib/client/api.ts` (375
lines) independently re-implements `request()`, an error class and
`isTimerConflict`. The two have **divergent designs** — the package is
bearer-authed and returns `unknown` from most methods; the live one is
cookie-authed, fully typed through `Response<T>`, and carries the 401→`/signin`
redirect the package lacks.

So three API clients exist (this, `lib/client/api.ts`, Swift's `API.swift`),
each with its own error type. When Expo arrives, whoever picks up the package
inherits the untyped, redirect-less one. Decide: promote it to the real shared
client, or delete it.

---

## Suggested sequencing

**1b → 2 → 6** are one program: make `packages/schema` load-bearing for route
validation, derive the row-converter types from it, delete the second boundary
in `invoicing.ts`. That closes the settings bug by construction, removes every
`Record<string, any>`, and makes generating a Swift client cheap rather than
speculative. Highest leverage in the repo.

**1** (one rate expression + a test asserting TS and SQL agree over the seed)
and **8** (key factory, which fixes the `use-timer` staleness) are independent
and self-contained — good first cuts.

**3** is the biggest single deletion and needs a product decision first: is the
exit animation worth keeping at all? Answer that before planning it.

**5** and **9** are decide-and-delete. Removing the two dead components takes
~40 lines of comment with them.

---

## Deliberately not flagged

So a review pass does not "fix" them:

- **Error handling is uniform.** All 20 route handlers wrap in `handle()`. No
  action needed.
- **`components/ui/`** is vendored shadcn, rewritten by `shadcn-detox.mjs`.
  Hand-edits get overwritten.
- **`calendar.tsx`** is 720 lines but only ~6 stateful hooks — length is
  render, not tangle. Lower priority than its size suggests.
- **`activity-strip.tsx`, `nav-timer.tsx`** are parked deliberately;
  `tasks.md` carries their removal.
- **DST arithmetic** in `grid.ts` / `calendar.ts` is load-bearing.
