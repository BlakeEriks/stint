# The Home Screen

Status: **built**, except where a section says otherwise. This was a
specification and the note at the top still said "nothing here is shipped
behavior" long after the cards and the inbox had shipped — read the row tables
as describing the app, and `tasks.md` for what genuinely is not built
(customization, quiet clients, revenue pace).

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

| Slot | Card | Why here |
|---|---|---|
| 1 | **Unbilled** | Money waiting. |
| 2 | **Pace** | Money coming. |
| 3 | **Activity** (heatmap) | Texture. |
| 4 | **Today's entries** | Unchanged. |

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
twenty unbilled clients has a different problem than this card solves.

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

Whether the target is hours or revenue is a user choice; the card renders in
whichever unit was set.

### Activity

A heatmap, keyed to clients rather than to volume alone.

**Default range is 12 weeks.** A year-wide GitHub-style grid works because a
commit is binary and the grid is dense; a solo contractor's year is five days
a week with holidays cut out of it, and at 52 weeks most cells are empty and
the rest are the same shade. Twelve weeks is a quarter, dense enough to read
and wide enough to show a rhythm. 26 and 52 are available as a range control.

**Hue is the client; intensity is hours.** Each client already carries a
`color`, so the strip answers *when did the Acme work actually happen?* — a
question that comes up in scope discussions and quarterly retros, and which a
single-hue ramp cannot answer at all. A day split across clients takes the
hue of its largest share; the tooltip carries the full breakdown.

**Gaps are information.** For a contractor a blank day is a vacation or a dry
spell, and both matter. A clean five-on-two-off rhythm versus a ragged one
says something about sustainability that no total does. The empty-cell color
is a real surface, not a hole — the strip should read as weeks that include
rest, not as missing data.

### Customization

Users may **reorder** cards and **hide** them, and may set the Activity range.
Preferences are per-user and sync like any other setting.

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

**Open: where preferences are stored.** A `home_cards` JSONB column on
`user_settings` versus discrete columns is undecided. JSONB is the obvious fit
for an ordered list of card ids with visibility flags, but every other
preference in that table is a typed column with a check constraint, and an
unvalidated blob is exactly the kind of thing that drifts. Decide before
building, not during.

## Under consideration

Both were argued against in the original brainstorm and neither objection is
fatal. Each states the question it has to answer before it ships.

### Week-over-week deltas

*The objection:* on lumpy contract work a 40% week-over-week drop usually
means a client's sprint ended, not that anything changed. A delta that is
noise most weeks trains the user to ignore it, which then hides the one week
it was real.

*The counter:* the noise comes from the comparison, not the concept. Compared
against a **4-week median** instead of last week, and **suppressed below a
threshold**, a delta becomes rare enough to mean something.

*The question it must answer:* what threshold makes it fire rarely enough to
be worth reading? That is an empirical question, answerable only against real
data — so this waits until there is some. If it ships, it belongs as a line
inside Pace, not as its own card.

### Time-of-day heatmap

*The objection:* an hours-by-hour grid is genuinely interesting and changes
nothing. The week view in `use-calendar.ts` already shows this shape for
anyone who wants to look.

*The counter:* it changes something when **crossed with billability**.
"Your unbillable time clusters between 9 and 11am" is a finding a contractor
can act on tomorrow. Plain volume by hour is not.

*The question it must answer:* does the billable/unbillable split actually
vary by hour enough to see, on a real dataset? If the answer is that admin is
scattered evenly through the day, the card has nothing to say and should not
ship. Check before building.

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

**Nothing on this screen writes.** Every card reads, and every action is a
link to the surface that owns the mutation. A dashboard that edits data is how
an accidental click becomes a changed invoice.

## What this needs from the API

Both marked **(not implemented)** in `docs/api.md`.

`GET /stats` — one call backing cards 2 through 4: unbilled by client with
aging, month-to-date against target, billable ratio, and the attention rows.
One request because these render together and a card set that pops in
piecemeal reads as broken.

`GET /calendar?granularity=day` — the Activity strip. The existing endpoint
already groups by local day server-side, which is the DST-correct bucketing a
heatmap needs and the reason not to build a second one. It returns full
entries, though, and twelve weeks of those is a heavy payload for a strip that
draws one rectangle per day; the day-granularity mode returns
`{ date, totalSeconds, byClient }` and nothing else.

**Open: the target setting.** Pace needs a nullable monthly target and a unit
(hours or revenue) on `user_settings`. Columns are not yet specified.
