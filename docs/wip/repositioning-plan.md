# Repositioning plan — working document

**Status:** in discussion. Nothing in `docs/` has been rewritten yet.
Decisions get marked DECIDED as we settle them; everything else is open.

Worktree `stint-repositioning`, branch `repositioning`.

---

## 0. The thesis

Restraint does not survive this market. It is a claim about us, not about the
user's problem; a free Toggl user ignores unused features at zero cost, so "we
do less" buys them nothing. Every competitor claims simplicity.

Three things hold up instead, because they are structural rather than
aesthetic:

1. **Per-seat pricing makes every competitor hostile to solos.** Toggl gates
   billable rates at $9/seat. Everhour has a 5-seat minimum. Harvest meters
   the dollars you invoice. None can fix this without cannibalising team
   revenue — a conflict of interest, not a feature gap.
2. **The invoice is the product; the timer is the input.** Time tracking is a
   commodity five competitors give away. The numbered, rate-frozen,
   ACH-bearing PDF is the thing worth money.
3. **Predictability is the live wound.** Harvest users just got surprise
   bills. It is the one promise incumbents cannot currently make.

One line: *built for one person, priced like it, and the invoice is always
right.*

Restraint becomes a **consequence** — no team features because there is no
team — not a principle.

---

## 1. Home dashboard — DECIDED

Reviewed `home-v7.html`. Three horizons, one inbox, genuinely uncluttered;
the structure stays, and so does the projection.

**Stickiness is a real retention mechanism, not decoration.** Invoicing is
episodic — used once a month, a tool gets cancelled, which is the classic
micro-SaaS failure. The timer is the daily habit that keeps the invoice
subscription alive, so Home's job *is* retention. The constraint: the feeling
must come from a true number. No invented compliance metrics.

**A three-stage pipeline fails the real case.** One client paid monthly leaves
`awaiting` at 0 for most of the month and `collected` frozen after week one —
three static numbers, one usually zero.

**Decided:**

- **Today** and **This week** unchanged — hours and activity are a work view.
- **This month** headline is **unbilled**: a balance that climbs as you work
  and resets when you invoice. The number no competitor can produce, and one
  that moves daily.
- **The projection stays**, and projects **earned month-to-date extrapolated
  to month-end** — monotonic, so it can be extrapolated. Unbilled cannot be
  projected: it would forecast when you next invoice and would predict a drop
  to zero.
- **Earned is bucketed by when the work was done**, not when it was invoiced.
- The chart plots cumulative earned, as it already does.
- **Awaiting** is one quiet line, shown only when non-zero. **Collected**
  lives on `/invoices`, visited deliberately.
- Headline and chart-today show the same figure until the first invoice, and
  the divergence at that moment teaches the difference. No explanatory label.

---

## 2. Doc restructuring — DRAFTED, not started

3,087 lines today. `tasks.md` alone is 882 and holds a cross-tenant write
vulnerability in the same flat list as menu-bar pip alignment.

| Doc | Action |
| --- | --- |
| `docs/positioning.md` | **New.** Who it is for, the three advantages, the pricing split, what we refuse. ~60 lines. Source of truth. |
| `docs/design/principles.md` | **Rewrite.** Drop restraint-as-thesis; rebuild on one person / invoice is the product / predictable price / never silently modify. Trust rules stay and become load-bearing. |
| `docs/tasks.md` | **Split** → `roadmap.md` (gated, milestone-ordered) + `defects.md` (severity-ranked). Cut hard; non-launch, non-defect items are deleted. |
| `docs/architecture.md` | **Amend.** Good doc; update opening thesis, drop Toggl-as-only-competitor. |
| `docs/design/landing.html` | **Revise.** Resolve "free to use, fully" → real split. Name the price. Fix the section implying mobile ships. |
| `CLAUDE.md` | **Trim.** Jurisdiction duplicates global CLAUDE.md; point at positioning.md rather than restating thesis. |
| data-model, api, local-dev, deploying, setup, macos | **Unchanged** — mechanism, not positioning. |

---

## 3. The roadmap gate — DRAFTED

Adding a task currently costs nothing. Four questions, ≤5 lines, no answer no
entry:

1. **Whose problem?** A named user situation, not a capability.
2. **What breaks without it?** Opt-out at signup / churn in month three /
   annoyance. Annoyance does not make the roadmap.
3. **One person, or a team we do not have?**
4. **Which milestone, and does it block launch?**

Three lanes and nothing else: `roadmap.md` (gated), `defects.md` (bugs are
self-justifying, no gate), deleted. A refusal likely to recur gets one line in
principles.

---

## 4. Launch milestones — DRAFTED

- **M0 — Correctness.** Cross-tenant `project_id` write; bearer-token auth
  test; `allocate_invoice_number` grant. Security and money integrity; nothing
  ships over these.
- **M1 — The invoice can represent a real business.** Non-time line items:
  flat fee and rebilled expense. `LineItem` requires `quantitySeconds` and
  `entryIds` (`packages/core/src/invoice.ts:27`), so this touches core, SQL,
  PDF and API. Largest item, and it gates revenue directly.
- **M2 — Trust the tool with your records.** CSV export of entries and
  invoices. Cheap; removes the "can I get my data out" objection.
- **M3 — Money truth on Home.** Pending section 1.
- **M4 — Price and page.** Name the number, implement the download paywall,
  land the honest landing page.

After launch, deliberately: recurring invoices, Toggl/Harvest import, payment
links, mobile.

---

## 5. Anti-drift — DRAFTED

1. One source of truth per claim, via the existing table in `CLAUDE.md`.
2. `.claude/rules/positioning.md` with `paths:` on `docs/**` and
   `landing.html` — loads the thesis when an agent edits a doc, costs nothing
   otherwise.
3. Gate checklist at the top of `roadmap.md`.
4. Delete on completion (already the rule).

No automated prose linting — `/trim` exists and CI prose checks get ignored.

---

## Decisions taken

- **Home dashboard** — re-nouned to unbilled + earned projection (section 1).
- **Price** — **$15/mo, $120/yr**.
- **First writing pass** — `positioning.md` + `principles.md` only, reviewed
  before anything else is touched.
- **Refusals are gutted** — see section 6.

## Still open

- [ ] Whether the month card keeps a goal line (`monthly_target` exists in
      `user_settings`).
- [ ] Quarter target — previously refused, plausibly good under the new
      thesis (contractors think in quarters for tax). Revisit post-launch.

## 6. Refusals — GUTTED

The 19-item Refusals list in `principles.md` goes, with no replacement
section.

It confused three kinds of thing: real positioning stances (no email
sending), craft decisions that belong with the craft (no fourth motion
duration, no icon per inbox card), and decision vomit from single afternoons
(the inbox is never copied onto Home at narrow widths). Its stated purpose —
being read before something is re-proposed — never happened once.

The real damage is that it froze decisions made under the old thesis. "No
week or quarter targets" was reasoned from restraint; under *one person, get
paid*, a quarter target is plausibly good. Several entries are now simply
wrong ("revenue is work done, not money collected"; "no total across
collected, awaiting and unbilled").

- **Delete 16.** If the app behaves that way, the code is the record.
- **Promote 1 to a principle, stated positively:** invoices go out from the
  user's own address, for domain reputation and a copy in their Sent folder.
- **Move 1 to `landing.html`:** the "overlapping entries" copy guidance
  belongs where the copy lives.

Anti-re-litigation moves into the gate instead of a graveyard: *if a past
version of this was rejected, say what changed — the thesis moved in
Sept 2026 and old rejections do not bind.*

## 7. Duplication between docs

The routing table in `CLAUDE.md` says one claim, one owning doc. Two files
saying the same thing means an edit to one leaves the other silently wrong.

**Resolved:** the email stance was byte-identical in `positioning.md` and
`principles.md`. It is a product belief with a product reason, so
`principles.md` owns it; `positioning.md` keeps a one-line pointer because a
reader comparing us to competitors will ask about the gap.

**Known and unresolved:** `CLAUDE.md`'s Non-negotiables restate the timer
invariant, never-silently-modify, rates-freeze and server-owns-truth, all of
which `principles.md` now owns. `CLAUDE.md` is meant to hold only what no
other doc owns. Pending the audit before deciding whether these are deleted
or reduced to pointers.

## Caveat carried through

Built on market research, not customers. "Contractors will pay $15 for a
correct invoice" is the right bet on available evidence; it is not validated.
