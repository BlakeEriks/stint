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

**No snooze on the inbox.** Hiding a row that is still true makes the inbox
something dismissed reflexively rather than read, and the user most likely to
snooze everything is the one it exists for. Grace periods keep it quiet enough
that nothing needs dismissing.

**No per-project colours.** Colour answers *whose work is this?*; a project is
a subdivision of a client already identified by it. See `brand.html`.

## Platform scope

The web app is where features are built. The native apps exist for the things
only they can do:

- **macOS** — menu bar presence, toggling between current timer and today's
  total.
- **Mobile** — starting and stopping away from the desk.

Neither is a port of the web app, and neither should grow into one.
