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

- [ ] **Record a reminder on a sent invoice.** `last_reminded_at`, so an
      overdue row can read "12 days late · chased 3d ago" rather than either
      nagging unchanged or disappearing. This is the honest alternative to a
      snooze: it records what you did instead of hiding what is true, and
      over time shows which clients need chasing twice. Needs a column, a
      PATCH field, and a third inline action on the overdue row.
- [ ] **Quiet clients in `/stats`.** The attention card is specified to flag
      an active client with no entries in 30 days, and it is the one row not
      yet implemented — it needs a per-client last-entry query, and the
      rollup only returns clients with unbilled work. Phrase it as an
      observation, not an alarm: a finished engagement is the common cause and
      archiving is the useful action, so the row links to the client.
- [ ] **Revenue pace.** A revenue target is accepted and stored but pace
      reports `actual: null` for it, because revenue means invoiced plus
      unbilled-at-resolved-rate and that is a different query from summing
      time entries. The card currently says the figure is unavailable rather
      than showing hours against a money target.
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
- [ ] **Light mode.** The palette already exists: `tokens.css` emits the full
      light ramp under `[data-theme="light"]`, the mirrored curve
      (`L = 0.985 - 0.840 * t^1.55`) is derived, and `docs/design/color.md`
      records the one forced concession — the accent drops 35 lightness points
      to `#1F7E17` (4.96:1), because neon green's luminance is intrinsically
      near white's and cannot carry text contrast on a light ground at any
      chroma. In light mode the ground provides the energy.

      So what is missing is not colour work: it is a **toggle**, persistence,
      and verification.

      - The app is **dark-first on purpose**: `prefers-color-scheme: light`
        only applies under an explicit `[data-theme="light"]`, so an
        un-stamped viewer gets the theme the palette was derived for. Keep
        that — a system-following default would flip the app for anyone whose
        OS is light, which is not what the palette assumes.
      - Three states, not two: dark / light / follow-system. Store the choice
        per-device in `localStorage` (a layout preference, not account state),
        and stamp `data-theme` before first paint or the page flashes dark.
      - `validate.js` asserts contrast on the dark palette. It must cover
        **both** — `--text-on-accent` inverts between themes, and the
        `text-on-danger` token exists precisely because near-black is 5.39:1
        on dark danger but 3.25:1 on light.
      - The shadows differ too (`docs/design/color.md`: light uses
        `rgba(16,18,26,0.06-0.10)`), and "content floats, chrome recedes"
        has to survive the inversion — cards must not read as holes.

- [ ] **End-to-end tests in a real browser.** Everything verified by hand
      this session is verified *once*: the three existing suites cannot reach
      any of it. UI tests are jsdom with stubbed fetch — and jsdom **cannot
      parse Tailwind 4's compiled CSS**, so they see no colours, no
      breakpoints and no layout. Route tests never render. Nothing covers the
      browser, navigation, cookies, server components or redirects.

      The specific flows I checked manually and that nothing re-checks:

      - **sign in via magic link** (Mailpit → click → session) and
        **sign out** (cookies cleared, API 401s, Back does not show cached
        authenticated markup — that last one was a real bug found by hand)
      - **navigating between tabs** with the rail, and the active-section
        marking
      - **the runaway timer choice** end to end: a real overlong timer,
        Adjust stopping it and opening the editor pre-filled, Discard
        deleting it
      - **entry editing** round-tripping local wall-clock through UTC, and
        the overnight case
      - **mark paid / mark sent** clearing an attention row, and the row
        leaving because the fact changed
      - **responsive layout** at 375px and 1280px, where the breakpoints the
        jsdom tests cannot see actually apply
      - **the accent rule** in rendered pixels, not class strings

      Playwright is the obvious tool, and the local Supabase stack is what
      makes it viable: a real database, a real auth server, and Mailpit to
      read the magic link from, all disposable via `pnpm dev:reset`. Seed
      first, run against `pnpm dev`, and keep it out of the `test` glob so a
      browser download is not a prerequisite for the unit suites.

      **Worth being honest about the cost:** e2e tests are the slowest and
      flakiest kind, and a suite that fails randomly gets ignored, which is
      worse than not having it. Start with the two flows whose breakage is
      silent and expensive — **sign-out** (a session that is not really
      cleared) and **the invoice lifecycle** — rather than covering
      everything.

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
