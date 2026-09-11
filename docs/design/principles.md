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

> The most common way a time tracker produces a wrong invoice: you forget to
> stop at 5pm and come back at 9am to a 16-hour entry. Past
> `max_timer_hours` (default 8, configurable) clients render the timer in
> `--timer-warning` — computed locally, no server involvement — and
> `GET /timer/current` and `GET /summary` both return `exceedsThreshold`. The
> user chooses: keep, adjust, or discard.
>
> Auto-trimming would mean the billing system silently changed a record of
> billable work. Even when the guess is right, the user cannot tell what
> happened. Surfacing costs one prompt; silent correction costs confidence in
> every number the app reports.
>
> macOS idle detection was considered and deferred — it is Mac-only and needs
> a background watcher, while the threshold rule works identically on all
> three platforms with one implementation. A push notification at the
> threshold is deferred too (needs APNs/FCM).

**Server owns truth; clients own responsiveness.** The timer keeps ticking
locally with no network, but the server decides whether it is running. Clients
never guess at global state.

**One accent, one meaning.** Green means *time is accruing*. It appears in one
place at a time. It never means success, never decorates navigation, never
marks a secondary button.

**Preview before anything irreversible.** Invoice generation allocates a
gapless number and locks entries. It is always preceded by a preview with no
side effects.

## The home screen

Timer hero at top, today's entries beneath it. This is the view seen 50× a day
and it earns the least friction. Calendar and invoicing are separate tabs.

## Platform scope

The web app is where features are built. The native apps exist for the things
only they can do:

- **macOS** — menu bar presence, toggling between current timer and today's
  total.
- **Mobile** — starting and stopping away from the desk.

Neither is a port of the web app, and neither should grow into one.
