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

## 6. Over-documentation: the same history retold in five files

The house style explains *why*, which is right and worth keeping. The debt is
narrative, not litter — there is essentially no commented-out code and **zero**
`TODO`/`FIXME`/`HACK` markers in the whole tree. The failure mode is
changelog-in-comments.

**The dominant pattern.** One migration — the timer moving out of the nav into
a docked bar — is retold across `timer-bar.tsx`, `dock.tsx`, `home.tsx` and
`home-cards.tsx`. This is a `docs/design/principles.md` entry that got
scattered across the components it was about, and it will be retold again
unless it lands somewhere.

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

## Suggested sequencing

**4** is the biggest single deletion and needs a product decision first: is the
exit animation worth keeping at all? Answer that before planning it.

**6** is decide-and-delete.

---

## Deliberately not flagged

So a review pass does not "fix" them:

- **Error handling is uniform.** All 20 route handlers wrap in `handle()`. No
  action needed.
- **`components/ui/`** is vendored shadcn, rewritten by `shadcn-detox.mjs`.
  Hand-edits get overwritten.
- **`calendar.tsx`** is 720 lines but only ~6 stateful hooks — length is
  render, not tangle. Lower priority than its size suggests.
- **DST arithmetic** in `grid.ts` / `calendar.ts` is load-bearing.
