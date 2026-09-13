# The Home Screen

This describes the screen as it is. Where something is specified but not
built, the section says so and points at `tasks.md` — which is the only place
unbuilt work is tracked.

There is no status line here on purpose. This file carried one for a long
time, and it said "nothing here is shipped behavior" for months after the
cards and the inbox shipped.

## What this screen answers

Toggl's dashboard answers *how did I spend my time?* For a solo contractor
that is the wrong question — you already know, you were there. Worse, Toggl
spends the rest of the screen on team features a solo user cannot have: "1
member in your organization," team activity, an upsell for a plan that would
make the app worse. The free tier is treated as a lobby.

The questions a contractor genuinely cannot answer from memory:

1. **How much money is sitting unbilled right now?** — the number that
   reliably surprises people.
2. **Is anything about to go wrong?** — a client gone quiet, an invoice past
   due, a timer left running overnight.
3. **Am I on pace?** — against a target, not an abstraction.

### Stats are denominated in money

Hours are the raw material; dollars are what the user thinks in. This app
resolves rates (`entry → project → client → settings`) and owns an invoice
table, so it can answer the money question and Toggl structurally cannot.
Where a stat can be stated in currency, it is — hours appear alongside as
the supporting detail, not as the headline.

The exception is unbillable work, which has no rate by definition. Those rows
show hours and an em-dash.

### What earns a place

A card ships only if it has **a number the user cannot compute in their head**
or **a row they can click to act on**. Preferably both.

"Interesting" is not the bar. A card that merely describes what the user
already lived through is decoration, and decoration on this screen is how the
app becomes the thing it was built against.

## Layout

**Unbilled** and **Pace** share a row at `lg` — a `1.6fr / 1fr` grid, not
equal columns, because Unbilled carries a list of clients and Pace carries one
figure and a bar. Equal columns would starve the side with something to say to
pad the side without. **Activity** spans the full width beneath them, then
**today's entries**.

The grid is conditional: both cards hide themselves when they have nothing
(no unbilled work, no target set), and a fixed two-column track would leave a
visible hole on an ordinary day.

Money waiting, then coming, then texture. Everything above the entry list
should be readable in about three seconds.

**Two things left this screen and are now frame furniture.** The timer is
docked to the bottom on every route, so it can be started from anywhere rather
than only from here; and money *at risk* moved to the inbox in the dock, for
the reasons in *The inbox* below. What remains is the money and the texture —
the entry list is still fixed, because it is half of why the screen is opened
fifty times a day. Billable ratio is a single line in the Pace card, not a
card.

## The inbox

Everything that wants a decision, in one fixed place. It is **not a card on
this screen** — it lives in the dock, visible from every route
(`apps/web/src/components/inbox.tsx`). It is specified here because it is fed
by the same `GET /stats` call as the cards below.

| Row | Condition | Shows |
|---|---|---|
| Runaway timer | `exceedsThreshold` from `/summary` | Hours so far, and the keep/adjust/discard choice |
| Overdue invoice | `status = 'sent'` and `due_date` more than **7 days** past | Client, amount, days late |
| Stale draft | `status = 'draft'` issued more than **7 days** ago | Client, amount, age |
| Unprojected entries | `project_id is null`, unbilled, billable, ended | Count, total hours |

**It is always present, including when it is empty**, and that is a deliberate
reversal. The card this replaced rendered only when it had rows, on the
argument that a permanent "all clear" is the `SaveIndicator` problem — a check
that is always present says nothing.

That rule does not transfer. A save indicator is transient and sits inline
with a form, so always-present really does mean always-ignored; **a dock
region is furniture**, and staying put is the entire point. A user wondering
where a section went is a real cost, the page reflowed at the exact moment you
fixed something, and "Nothing needs you." is information rather than noise.

The rename follows from that: "Needs attention" is a predicate and suited a
thing that appeared only while the predicate held. An inbox is a place.

### Ordering and tone

The runaway timer sorts first — it is the only row about time being recorded
*wrongly right now*, where an overdue invoice is equally late in an hour, and
the only row whose subject changes while you read it. Overdue invoices sort
next and carry `danger`; the rest carry `warning`. Never the accent — see
*Constraints inherited* below.

### The grace periods are the point

An invoice fires at **`due_date` + 7 days**, not the moment it passes. Net 30
with a client who pays on day 32 is ordinary, and a card that flags it trains
the user to clear the list without reading it — which is how the one genuinely
late invoice gets dismissed with the rest. The invoice page still shows the
true due date; this governs only when the inbox speaks up.

A **snooze was considered and rejected.** Hiding a row that is still true
makes the inbox something dismissed reflexively rather than read, and the user
most likely to snooze everything is the one it exists for. Recording a chase
(`tasks.md`) keeps the fact instead of hiding it.

### What each row may do

The rows **write, narrowly.** Marking an invoice paid or sent is offered
inline, because that is the action that legitimately clears a row — the
underlying fact changed. **Nothing destructive is offered:** voiding and
deleting belong on the invoice itself, where the whole document is in view.

The runaway timer row **surfaces, it does not correct**, and offers the
keep/adjust/discard choice specified in `principles.md`. It is the one row
that is dismissible, because it is the one whose condition is a judgement
rather than a fact: a long timer is often correct. `dismissed` resets when the
overrun ends, so Keep silences that overrun rather than the feature.

Every other row disappears only when its condition stops holding. **Nothing is
stored** — the rows are derived per request, so marking an invoice paid clears
its row because the predicate stops being true, not because anything was
written to a queue. An inbox table would need every write path to remember to
clear it, and a stale row claiming money is late after it arrived is the same
trust failure as silently editing hours.

## The cards

### Unbilled

The headline number, and the reason this screen exists.

```
Unbilled                              $4,280
  Acme Corp           18.5h  $2,775   oldest 22d
  Byrne Studio         9.0h  $1,125   oldest  6d
  Internal             4.2h      —
```

Sources `time_entries` where `invoice_id is null`, `is_billable`, and
`ended_at is not null` — running timers never count, matching the invoicing
rule that you cannot bill time still accruing.

**The aging column is the insight.** A total alone is a fact; a total with
"oldest 22 days" is a prompt. Work aging past a month is the most common way
a solo contractor loses money, and no competitor surfaces it because none of
them know the rate.

Each client row links to invoice generation for that client, pre-filled with
the period covering its unbilled entries. That is what makes the card an
action rather than a readout.

**Never labelled "earned" or "revenue."** It is work done and not yet
invoiced — money the user might still never see. Overstating it in a billing
tool is the same trust failure as silently editing an entry.

Rows are capped at five clients with a "+N more" line; a contractor with
twenty unbilled clients has a different problem than this card solves. **The
cap is server-side** — `/stats` returns at most five rows plus a `moreClients`
count, so the card renders what it is given rather than deciding. The total
above it still covers every client, capped or not.

**A client with unrated work carries its count on the row**, beside the aging:
"oldest 9d · 2 unrated". Those entries contribute hours but no money, so
without it the row's amount reads as low rather than as incomplete.

**`awaitingPayment` is one line at the foot, and is never added to the
total.** Unbilled is work not yet invoiced; awaiting payment is money already
asked for. Summing them double-counts the same hours.

### Pace

Month-to-date against a target, with the ahead/behind figure spelled out.

```
September            87h / 120h    ▓▓▓▓▓▓▓░░░   on pace  +2h
                     82% billable
```

"On pace" is derived from business days elapsed in the month, not calendar
days — a target of 120 hours is 6 hours a business day, and a Monday reading
of "behind" because the weekend passed would be noise pretending to be signal.

**The whole card hides when no target is set.** An empty progress bar asking
to be configured is a chore the app assigned itself.

Billable ratio is the second line, not its own card. Contractors consistently
underestimate how much unbillable admin they absorb, and one percentage is
the entire finding — it does not deserve a chart.

Whether the target is hours or revenue is a user choice, and the database and
route carry both. **The card only renders hours.** A revenue target stores and
validates correctly, then the card says pace in that unit is not computed yet
— revenue means invoiced plus unbilled-at-resolved-rate, which is a different
query from summing time entries (`tasks.md`). Saying so is better than
rendering hours under a money target.

### Activity

**Hours per day, stacked by client** (`activity-chart.tsx`). Ranges are 14 and
30 days; 30 is the default.

It replaced a twelve-week heatmap, which is still in the tree
(`activity-strip.tsx`) but is not rendered. The heatmap answered the same
question — *when did the work happen, and whose was it?* — and could not do
two things:

- **Show every share, not just the largest.** The endpoint always returned
  `byClient` per day and the strip kept only the dominant hue, so a day split
  6h Northwind / 2h Byrne rendered as a solid Northwind cell. That 2h is
  exactly what gets argued about in a scope conversation.
- **Show magnitude.** An intensity ramp carries about four distinguishable
  steps; a bar carries the number. "Was Tuesday a three-hour day or a
  nine-hour day?" is unanswerable on a heatmap.

**Hue is still the client**, resolved as everywhere else, and never the accent
— that belongs to the running timer. Internal work keeps a neutral that reads
as worked rather than as rest.

**Gaps stay real.** Every day in the range gets a column, so a blank one is a
weekend or a dry spell rather than missing data. A clean five-on-two-off
rhythm versus a ragged one says something no total does.

**Past five clients the remainder collapses into one neutral band** — the same
shape as `moreClients` on the Unbilled card, and for the same reason: beyond
that the legend becomes the card and the hues stop being separable.

**90 days is deliberately absent.** At day granularity that is 90 bars in a
~660px card — a ~4px bar, worse than the heatmap was at the same job. It needs
week bucketing server-side, for the same DST reason day bucketing already
lives there, which is a route change with its own correctness tests rather
than an option to add here.

### Customization

The Activity range control is the only customization that exists. Reordering
and hiding cards are **not built** (`tasks.md`); what follows is the shape
they must take if they ever are.

They may **not** compose new metrics, choose chart types, or add a second copy
of a card. "Pick your own dashboard" is the most natural path by which a
restraint-first product becomes the thing it was built against, and the answer
is decided here rather than argued later.

**The inbox cannot be hidden**, and this is now structural rather than a rule
to enforce: it is not a card, so there is nothing to reorder or switch off. A
region that appears only when something is wrong is worthless if it can be
turned off, and the user most likely to turn it off is the one it exists for.

The timer bar, the inbox and the entry list are not cards and are not
customizable.

Preferences would live in a `home_cards` JSONB column on `user_settings` —
decided, and recorded in `tasks.md` with the reasoning. It is the one place in
that table where a typed column does not fit, since the value is an ordered
list of card ids with visibility flags.

## Held back, with the question each must answer

Two cards are argued for and not built: **week-over-week deltas** and a
**time-of-day heatmap**. Neither objection to them is fatal, and each has one
empirical question it has to answer first — what delta threshold fires rarely
enough to be worth reading, and whether the billable/unbillable split really
varies by hour on a real dataset.

Both live in `tasks.md` with their full reasoning. They are named here only so
that someone reading this file does not propose them a third time.


## Rejected

Kept on the page so they are not re-litigated. Each will look appealing again.

**Top projects this week.** The Toggl original complaint: with one to three
clients, a ranked table is a ranked table of one. If the distribution is worth
showing at all it is a single horizontal stacked bar with clients as segments
— one row, no header, no ranking.

**Pie charts.** A solo contractor's time splits two to four ways. A bar does
that in less space and stays readable when one slice is 4%.

**Streaks and gamification.** Logging every day is not a virtue for someone
billing hourly, and rewarding it pushes toward exactly the overwork that
surfacing runaway timers exists to catch. The app should never congratulate a
user for a fourteen-day streak.

**Team and comparison stats.** There is no team. This is the slot Toggl wastes
and the inbox fills.

## Constraints inherited

**The heatmap is never green.** Green `#52FC43` means the running timer, and a
green intensity ramp would put a second green meaning on the same screen —
the one thing `principles.md` forbids. Activity uses client colors over a
neutral empty cell. This is decided up front because a green heatmap is the
natural first implementation and painful to unwind after it ships.

No card carries the accent, and neither does the inbox — including its runaway
timer row, which is about a timer and still renders in `warning`. On this
screen the accent is spent, and it is spent on the running timer in the bar
below. Tested (`test/ui/inbox.test.tsx` asserts no `accent` class survives).

**Warning and danger are the alert channel.** `timer-warning` (`#DBA929`) and
`danger` (`#E9504D`) carry the inbox's rows. Success cyan appears nowhere on
this screen — nothing here is an outcome.

**Durations are mono and tabular**, without exception, as everywhere else.
So are currency figures: an unbilled column that reflows as digits change is
the same defect as a timer that does.

**Aggregate rate resolution belongs in SQL.** `resolve_entry_rate(uuid)` is
per-entry; the Unbilled card sums across potentially hundreds of entries and
must not call it N times. A set-returning rollup is the correct shape, and per
`data-model.md` the SQL implementation is authoritative regardless.

**No card writes.** Every card reads, and every action on one is a link to the
surface that owns the mutation. A dashboard that edits data is how an
accidental click becomes a changed invoice.

The inbox is the narrow exception, and *What each row may do* above states its
limits: it writes only what legitimately clears a row, and never destructively.

## What this screen takes from the API

`GET /stats` — one call backing every card and the inbox: unbilled by client
with aging, month-to-date against target, billable ratio, and the attention
rows. One request because these render together and a set that pops in
piecemeal reads as broken.

`GET /calendar?granularity=day` — the Activity chart. The existing endpoint
already groups by local day server-side, which is the DST-correct bucketing
this needs and the reason not to build a second one. It returns full entries
in its default mode, which is a heavy payload for something drawing one column
per day; the day-granularity mode returns `{ date, totalSeconds, byClient }`
and nothing else.

The target lives on `user_settings` as `monthly_target` and
`monthly_target_unit`, paired by a check constraint so neither can be set
without the other — see `data-model.md`.
