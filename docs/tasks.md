# Tasks

Everything wanted and not yet built, in one file. The only file — there is no
separate roadmap, because two lists means one of them is stale and you cannot
tell which.

**A finished task is DELETED, not ticked.** A file of completed work stops
being a to-do list and becomes a changelog that nobody updates; git already
records what shipped, and `CLAUDE.md` records why. If a line no longer
describes something we intend to do, delete it — including because we decided
against it, in which case the refusal belongs in `docs/design/principles.md`
where it will be read before being re-proposed.

Sections are about readiness, not priority: **Ready** needs no decisions,
**Needs a decision first** names the question blocking it, **Deferred** says
what it is waiting on.

Everything here has been measured against the thesis in
`docs/design/principles.md`: *does this help a solo contractor track time and
get paid?* Ideas that failed that test are recorded there as refusals, not
here. A line is not a commitment to ship — it is a commitment to have already
thought about the hard part, so the decision is not re-litigated from scratch
later.

## Ready

- [ ] **Edit and delete a logged entry.** `updateEntry`, `deleteEntry` and
      `createEntry` all exist in `lib/client/api.ts` with **zero callers** —
      the routes are built and tested, and no UI reaches them. So a mistracked
      entry cannot be corrected and a bogus one cannot be removed, in an app
      whose whole claim is that the numbers on the invoice are the numbers you
      worked. This is the largest gap in the product.

      Editing is also what the runaway-timer promise depends on: the app
      "surfaces, never auto-trims", and surfacing is only honest if the user
      can then act. Today the banner says to adjust the duration and there is
      nowhere to do it.

      `PATCH /entries/:id` already returns 409 `ENTRY_LOCKED` for an entry on
      an issued invoice, so the UI must show that state rather than offering
      an edit that will fail. Manual creation (`createEntry`) needs a
      client-generated UUIDv7 — `uuidv7()` in `@stint/core` — so a retried
      insert is idempotent.

- [ ] **Runaway timer: offer keep / adjust / discard.** `principles.md`
      specifies this choice and the app only renders a warning banner.
      Depends on entry editing above. The rule that must not bend: the app
      surfaces the problem and never modifies the entry itself.

- [ ] **`GET /stats`** — one call backing the home cards: unbilled by client
      with aging, month-to-date against target, billable ratio, attention
      rows. One request because they render together and a card set that pops
      in piecemeal reads as broken. Aggregate rate resolution belongs in SQL
      as a set-returning rollup, not N calls to `resolve_entry_rate`. Marked
      **(not implemented)** in `docs/api.md`; spec in `docs/design/home.md`.

- [ ] **`GET /calendar?granularity=day`** — `{ date, totalSeconds, byClient }`
      and nothing else, for the Activity strip. The existing endpoint already
      buckets by local day server-side, which is the DST-correct grouping a
      heatmap needs and the reason not to build a second one — but it returns
      full entries, and twelve weeks of those is a heavy payload to draw one
      rectangle per day.

- [ ] **Home cards** — Needs attention, Unbilled, Pace, Activity, in that
      order: money at risk, money waiting, money coming, texture. Spec and
      rejections in `docs/design/home.md`. Constraints worth restating: the
      heatmap is never green, no card carries the accent, Needs attention
      renders only when non-empty and cannot be hidden, and nothing on the
      screen writes.

- [ ] **`home_cards` JSONB on `user_settings`** — card order and visibility.
      Validated by Zod at the API boundary rather than a check constraint, so
      adding a card is not a migration. Decided; the one place in that table
      where a typed column does not fit.


- [ ] **Projects page.** `/projects` API routes exist with no page; projects
      are only reachable through client dialogs. Everything else in the nav
      has a home.
- [ ] **Icons on the remaining buttons.** Nav and the additive actions have
      them; the lifecycle buttons on an invoice (send, mark paid, void,
      download) and the settings forms do not.
- [ ] **Account menu at the bottom of the rail, absorbing Settings.** The
      rail's sections are places you go; Settings is configuration you visit
      rarely, so it does not belong in the same run of items as Home and
      Calendar. Put the signed-in email at the foot of the rail as a dropdown
      trigger holding **Settings** and **Sign out**.

      **Not a Profile page.** Settings today is entirely business
      configuration — billing defaults, invoice identity, numbering, payment
      profiles — and none of it is "who am I". A profile for a single-user app
      would hold an email, a sign-out and eventually a theme: three items, not
      a page, and inventing one is the scope creep the thesis exists to
      resist. Your email *is* the account; there is no name, avatar or org.

      **This is also where sign-out finally lives — the app currently has
      none at all**, anywhere. That is the real gap this closes.

- [ ] **Collapsible rail.** Icon-only at ~3.5rem, full at 13rem, toggled by
      the user and remembered. The calendar is the screen that wants it: seven
      day columns plus a 13rem rail is tight on a laptop, and the rail is
      pure chrome once you know where things are.

      Collapsed shows icons alone, which is the one case where that is
      defensible — the labels were visible when you chose to collapse it, and
      expanding is one click. Every icon needs a real `aria-label` and a
      tooltip, since the label is no longer on screen. The running timer must
      survive the collapse in some form: dropping it would break "visible from
      every screen", so collapsed probably keeps the pulsing dot and the
      elapsed time without the task name.

      Store the preference per-viewer in `localStorage`, not on the server —
      it is a per-device layout choice, not account state, and a round-trip
      would make the rail flicker on load.

- [ ] **Today's entries wrap on narrow screens.** The row is one line —
      task, project, badge, time range, duration — and on a phone the middle
      fields are already hidden behind `sm:`/`md:` breakpoints to make it fit,
      so a phone silently loses the project and the time range. Two lines
      (task + duration above, project + range + badge below) shows everything
      instead of hiding it.

      Note this argues against the "an entry row is one line" rule in
      CLAUDE.md, which exists because single-line rows make a dense list
      scannable. The resolution is that the rule is about *wide* screens:
      hiding billing-relevant fields is worse than two lines, and a phone list
      is short enough that density is not the constraint. Update the rule
      rather than leaving the contradiction.

- [ ] **Client colour legend on the calendar.** A block's left edge carries
      its client's colour and nothing on the screen says which client that is
      — the mapping only exists in the clients list, on another page. Needs to
      cover the no-client case too, since internal work renders with no edge
      at all rather than a shared grey. Only list clients present in the week
      being viewed; a legend of every client a contractor has ever had is a
      key nobody reads. The same mapping is what the home screen's Activity
      heatmap will need, so whatever this becomes should be reusable.

## Needs a decision first

Each of these names the question blocking it. Answer the question, then it
moves up — do not start one by guessing the answer.

- [ ] **Week-over-week deltas.** *Question: what threshold makes it fire
      rarely enough to be worth reading?* On lumpy contract work a 40% drop
      usually means a client's sprint ended, and a delta that is noise most
      weeks trains you to ignore the one week it is real. Compared against a
      **4-week median** and suppressed below a threshold it could mean
      something — but the threshold is empirical and needs real data. If it
      ships it is a line inside Pace, not a card.

- [ ] **Time-of-day heatmap.** *Question: does the billable/unbillable split
      actually vary by hour enough to see, on a real dataset?* Plain volume by
      hour is interesting and changes nothing — the calendar week already
      shows that shape. Crossed with billability it might yield "your
      unbillable time clusters between 9 and 11am", which is actionable. If
      admin turns out to be scattered evenly through the day, the card has
      nothing to say and should not ship. Check before building.

- [ ] **Realtime cross-device updates.** *Question: is the 60s reconcile
      actually annoying in practice?* `architecture.md` notes Supabase
      Realtime can drop in later with no API change. Local tick plus
      reconcile-on-focus may well be enough; adding a persistent subscription
      to find out costs the cheap hosting posture.

## Rough edges

- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because the route tests inject `__TEST_DB__` and never take that path.
      Worth a test that hits a real server with a real token before the Expo
      or macOS app depends on it.

- [ ] **`type-section` is unused.** Kept because the home cards will want a
      section heading. If they ship without it, delete the role.
- [ ] **Calendar: a block can overlap the day's label.** Visible on Saturday
      in the seeded week — "Untitled" is clipped by the block above it.
- [ ] **Calendar header weight mismatch.** `type-title` at 24px/600 sits next
      to a mono readout and the pairing reads unbalanced.
- [ ] **`api.ts` still hand-writes request validation.** The route handlers
      define their own local Zod schemas and never import `@stint/schema`, so
      requests are validated against a second copy of the truth. Response
      types now derive; requests do not.

## Deferred

- **Branch protection** — needs GitHub Pro on a private repo. CI runs without
  enforcement by choice.
- **CodeQL** — dormant until the repo is public; Advanced Security is not
  available on private repos.
- **Toggl import** — waiting on Stint having been used for real billing for a
  few weeks. Importing two years of history into a tracker whose rough edges
  are undiscovered means finding them with real data inside.

  Why it matters: Toggl is where a new user's history already lives, and a
  contractor with two years in it cannot adopt Stint if adopting means
  abandoning the invoices, the annual totals and the "what did I bill them
  last spring" lookups. Without an import the switching cost is the real
  competitor, not Toggl's feature set.

  The model maps cleanly because ours is a subset — client → `clients`,
  project → `projects` (no client → `client_id = null`, already how unbilled
  work is modelled), entry → `time_entries` with `description` → `task_name`.
  Tags are **dropped**: there is no tag concept here and adding one to serve
  an import imports Toggl's scope along with its data. Toggl "tasks" flatten
  into `task_name`; workspaces do not apply.

  Four parts are actually hard, and each is a decision already made:

  - **Overlaps violate the timer invariant.** Toggl permits overlapping
    entries; a real export will contain them. This must NOT be resolved by
    silently adjusting timestamps — the app does not quietly change a record
    of billable work. Import everything unambiguous, then present the
    conflicting set as a review step. Import happens once in a lifetime, so a
    review step is cheap; a wrong hour inside a past invoice is not.
  - **Rates are not in the export, and `0` is a real rate.** The CSV carries
    an amount per entry, not the hierarchy that produced it. Back-computing
    rate from amount ÷ duration gives rounding noise and is simply wrong for
    anything billed flat. Imported entries resolve through the normal
    hierarchy; those that cannot surface as unrated, the same state invoicing
    already refuses to generate from. Never infer a rate, never write a
    guessed one to `rate_override`.
  - **Idempotency.** Derive a stable UUIDv7 per source entry so re-running a
    partial or interrupted import cannot duplicate anything. Re-importing the
    same file must be a no-op, not a second copy of the year.
  - **Timestamps and DST.** Toggl exports wall-clock local time plus a
    separate timezone field. Parse to an absolute instant and store UTC —
    never fixed-millisecond arithmetic, the same trap as the calendar.

  Durations are derived here (`duration_seconds` is generated), so the import
  writes `started_at`/`ended_at` and never a duration; where Toggl's own
  reported duration disagrees with its start/end pair, surface the
  disagreement rather than picking a winner.

  Shape: a **file upload**, not an API integration — the CSV/JSON export is
  stable, needs no OAuth app or stored third-party credential, and keeps
  working if their API changes. Parsing belongs in `packages/core` as pure
  functions over parsed rows, so the preview a user reviews and the rows that
  get written come from identical code, for the same reason invoice line-item
  construction lives there.

  **Out of scope, deliberately:** no live Toggl sync (two systems of record
  for the same hours is how you get two different invoices for the same week —
  the user is leaving Toggl, not running both), and no invoice import
  (issued invoices are immutable records with frozen rates and gapless
  numbering owned by `allocate_invoice_number()`; injecting foreign invoices
  corrupts the one guarantee numbering provides — historical invoices stay
  where they were issued, and entries already billed in Toggl import as
  non-billable or pre-marked so they cannot be billed twice).
- **macOS menu bar app** — `/summary` was built for it. The largest unbuilt
  surface and the one that would most change daily use.
- **Expo app** — last by design; reuses the most.
- **Runaway timer push notifications** — needs APNs/FCM, so effectively gated
  behind the native apps.
- **Calendar editing** (drag-to-adjust, click-to-create) — the largest felt
  gap day to day, since correcting a mistracked block means leaving the view
  where you noticed it.
