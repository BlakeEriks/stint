# Product Principles

## The thesis

Toggl is trying to do too much — it now ships project management alongside time
tracking. **The beauty of this app is in what it refuses to do.**

Every feature request gets measured against: *does this help a solo contractor
track time and get paid?* If not, it does not ship.

## Rules

**One timer. Always.** Not a constraint to work around — the organizing
principle. It is enforced by a database index, so overlapping entries are
impossible rather than cleaned up later. That is what makes the invoice
trustworthy.

**The app never silently changes your data.** Runaway timers are surfaced, not
auto-corrected. Rates are frozen onto invoices at generation. In a billing
system, silent modification is a trust failure, and trust is the whole product.

Past `max_timer_hours` (default 8) the inbox offers **keep, adjust or
discard**. Auto-trimming would mean the billing system silently edited a record
of billable work — and even when the guess is right, the user cannot tell what
happened. Surfacing costs one prompt; silent correction costs confidence in
every number the app reports.

**Server owns truth; clients own responsiveness.** The timer keeps ticking
locally with no network, but the server decides whether it is running. Clients
never guess at global state.

**Where a gesture writes, it is made deliberate rather than removed.** A
calendar block can be dragged to correct its times — the place you notice a
mistake should be the place you fix it. Drags snap to 15 minutes, commit only
past a 4px threshold, and a move preserves the original duration exactly rather
than re-deriving it. See `packages/core/src/grid.ts`.

**Preview before anything irreversible.** Invoice generation allocates a
gapless number and locks entries. It is always preceded by a preview with no
side effects.

**A card ships only if it carries a number the user cannot compute in their
head, or a row they can click to act on.** "Interesting" is not the bar.
Decoration on the home screen is the mechanism by which this app becomes the
one it was built against.

**Stats are denominated in money.** This app resolves rates and owns an invoice
table, so it can answer *how much is unbilled* — the question a contractor
cannot answer from memory, and one a tracker that does not know rates
structurally cannot ask. Hours are the raw material; dollars are what the user
thinks in.

Visual rules — the accent, the four planes, focus rings, type — live in
`brand.html`, where they can be seen rather than pictured.

## Refusals

Things proposed, decided against, and likely to come back. Everything else that
was rejected is simply not here.

**No email sending.** Invoices are downloaded and sent by the user from their
own address. Mail from a shared application domain gets filtered on the way to
a client and the sender only finds out when the client says it never arrived.
Sending it themselves uses their own domain's reputation and leaves a copy in
their Sent folder.

**No multi-step onboarding walkthrough.** A tour is a surface that needs
maintaining, breaks whenever the UI moves, and is scope of exactly the kind the
thesis refuses. Contextual empty states do the same work and cannot drift out
of sync with the screen they describe, because they *are* the screen.

**No snooze on a row the user can resolve.** Assign the project, fix the
runaway entry, send the draft — hiding one of those hides a problem from the
person who can fix it, and the user most likely to snooze everything is the one
the inbox exists for. Grace periods keep it quiet enough that nothing needs
dismissing.

**Awaiting payment is the exception, because looking is the only action.**
Whether a client has paid is outside the contractor's control: they can check a
bank balance and nothing more, so a row that sits permanently true with no way
to say *not yet* is a reminder with no off switch rather than an unattended
mess. It snoozes, defaulting to daily. Nothing else does.

**No total across collected, awaiting and unbilled.** Three stages of one
pipeline, and any two summed double-count the same hours. The tempting one is
awaiting plus unbilled, labelled *what I am owed*: awaiting has an invoice, a
due date and someone who owes it, while unbilled can still be discounted,
written off or never billed, so the sum lends the second the authority of the
first. It reads best and means least. The honest version of *what will land*
is awaiting, already on screen. `screens/money.html` is the region.

**No per-project hues.** Colour answers *whose work is this?*, so a project
never takes a hue of its own — it takes a step on its client's, which keeps
the answer the same at a glance. `deriving-colour.md` has the scale, and the
heatmap is excluded from it. See `brand.html`.

**No grouping layer between client and project.** The shape that wants one is
a client with internal sub-clients — billing goes to the parent, while the
work divides below it. A table for that is a nullable FK on projects, a rung
in every aggregate, and a fourth level in a rate chain `CLAUDE.md` already
requires two implementations to agree on. A naming convention carries it at no
cost (`BL · E24`), and project shades give the grouping its colour. Revisit
when prefixes become load-bearing across invoices and reports rather than a
reading aid.

**No "System" theme.** The palette is dark-first and its light block is keyed
to an explicit `[data-theme="light"]`, so a System option would resolve to
dark for everyone — a control that appears to do something and does nothing.
Following the OS honestly means changing the generator first.

**No warm neutral ground.** Rotating the hue is free in OKLCH so it is cheap
to propose, but a warm ground reads as brown or red, and the obvious choices
collapse the accent separation from 122° to 67–82°.

**No fourth motion duration.** A fourth is always a tweak of one of the two
that remain.

**No week or quarter targets, and never two units at once.** Three progress
bars competing for the same glance; a contractor thinks in months because
invoicing is monthly.

**Revenue is work done, not money collected, and it is bucketed by the entry's
date rather than the invoice's.** A bar that drops when a client pays late
reports someone else's behaviour as your own, and invoicing March's work on
April 1st is ordinary — booking it into April reports when paperwork happened.

**No editing a finished entry from the menu bar panel.** It needs a date and
two times the panel has no room for; resuming starts new work instead.

**The dock holds what you act on: the inbox, then Today beneath it.** A chart
is not among them — Pace is a monthly reading and thirty bars in a 280px
column is a ~4px bar. Rows survive the width because they are short and can
wrap; a figure per pixel-column cannot.

**The inbox is never also copied onto Home at narrow widths.** It has one home
and changes axis, not identity, across the breakpoint.

**Home is one view. No configurable card set, no reordering, no hiding.** A
`home_cards` preference was specced and cut before it was built: each toggle
multiplies the arrangements the screen has to be designed for, and every
later card then has to look right in all of them. The cost is not the
setting, it is that nobody can say what Home looks like any more. A card
worth showing is worth showing to everyone; one that is not earns deletion
rather than a checkbox. The same argument retires per-region timeframe
pickers — two regions side by side on different windows invite a comparison
that is not valid.

**No streak count on the heatmap.** A consecutive-days figure measures showing
up rather than getting paid, and it rewards the wrong thing: a contractor who
bills a good month in four long days reads worse than one who opens the app
daily. It also needs a forgiveness rule to be bearable, and a number fudged to
avoid punishing a dentist appointment is not one worth printing. The heatmap
shows the rhythm without scoring it.

**Awaiting-payment stays one line on Unbilled, never a row per invoice.** Rows
would put ordinary invoices back on Home and undo the overdue grace period;
reconciling several belongs on `/invoices`.

**"Overlapping entries are impossible" is not a landing-page pillar.** A solo
contractor with one timer has never produced one, so it reassures about a bug
they have never had, in the vocabulary of our implementation.

**An inbox card carries no icon for its kind.** A glyph per row type — a
stopwatch for the runaway, a document for the invoice — was drawn and cut. It
costs 21px of a 286px card's title line, and the title is the one thing there
that must not be cut: it names the subject, where the qualifier beneath it
already says which kind of problem this is, in words. Five shapes to learn buy
less than the sentence that was there anyway.

**A figure's count-up is not a CSS animation.** A keyframe animates a style,
and what has to move on a money figure is the rendered text of a number —
`$3,022.50` to `$3,135.00` is sixty distinct strings, which no interpolation
of a property produces. A pulse or a slide on change was the alternative, and
it says only that something changed; the travel says what it climbed to.


## Platform scope

The web app is where features are built. The native apps exist for the things
only they can do:

- **macOS** — menu bar presence, toggling between current timer and today's
  total.
- **Mobile** — starting and stopping away from the desk.

Neither is a port of the web app, and neither should grow into one.
