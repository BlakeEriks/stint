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

- [ ] **Hours invested per project — blocked on `/reports` existing.** The app
      can report hours per client (the unbilled rollup) and per day (the
      calendar) but not per project, which is the number behind the questions
      that actually get asked: is this fixed-price job underwater, how long did
      the last rebuild take, has the retainer been burned. The first is the
      most expensive thing to learn late.

      Two rules carry over from the home cards: it needs a **billed/unbilled
      split**, since one total hides whether any of it has been paid for — the
      rollup already groups by (client, rate) for that reason — and it is
      **never called "earned"**, because hours logged is work done, not money
      received.

      **Deliberately held** until the drill-through exists: a row reading
      "120h" invites "which 120 hours?", and shipping the number with no
      answer makes it a dead end. Not a burn-down — that needs a budget field
      which does not exist, and is its own line rather than folded into this.

- [ ] **`/reports` — the destination those numbers point at.** Not a filter on
      the calendar, which was the earlier framing: "which 120 hours?" is a
      missing *destination*, and one view answers it at project, client and
      date-range level from several entry points. Filters live in query params
      so a link is shareable and Back works. Hours per project is its first
      content, and the project row links to it.

      **"Reports" is a word that attracts scope** — Toggl's reports tab is
      most of what made it feel bloated. The guard is the existing bar on
      content, not on the nav entry: a view ships only if it carries a number
      the user cannot compute in their head, or rows they can act on. Hours
      per project passes. "Time by day of week" does not.

      **It is also where the two held-back cards belong.** Week-over-week
      deltas and the time-of-day heatmap are in "Needs a decision first"
      partly because they would clutter home; an analytical view is their
      honest home, so it should absorb that class of question rather than let
      the home screen grow a fourth card. That is an argument for building it.

      *Open question, to answer once there is real data:* does `/reports`
      **supersede** those two cards or merely host them? Leaning supersede — a
      week-over-week delta is something you go and look at deliberately, not
      something that should interrupt the screen opened fifty times a day.

- [ ] **Onboarding: teach the shape, never fabricate a record.** A new
      account's timer screen has nothing on it, and the least discoverable
      thing in the data model is that `client_id = null` is how unbillable
      work is tracked — nobody guesses that. "No projects yet." is the most
      discouraging string in the app.

      - **Seed an `Internal` project with no client** in
        `create_default_settings`, so the picker is not empty on first open
        and the null-client path is demonstrated rather than explained. A
        seeded *client* named "Blake Internal" was rejected: clients go on
        invoices and appear in the picker, the calendar legend and the
        unbilled rollup, so a non-customer sitting in the client list is
        exactly the confusion the null-client path exists to avoid.

        **Caution, and it is the highest-consequence write in the codebase:**
        that trigger fires inside Supabase's signup transaction, so anything
        it raises rolls the whole signup back and the client sees only
        `Database error saving new user` with a 500. It needs the same
        `security definer` + `set search_path = public, pg_temp` treatment as
        the existing insert (see `00000000000005`), and the insert must be
        `on conflict do nothing` for the same reason the settings insert is.
      - **An example entry row in the empty list** — rendered, visibly an
        example, never persisted, and gone the moment a real entry exists. An
        empty list teaches nothing; this teaches the same shape without
        writing a row.
      - **Extend the empty states, do not build a tour.** `/clients` already
        says "Add one to set a rate and bill against it" — that is the
        pattern. A multi-step walkthrough is a surface that needs maintaining
        and breaks whenever the UI moves.
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

- [ ] **Extend the end-to-end suite.** Sign-in, sign-out and the invoice
      lifecycle are covered (`pnpm test:e2e`). The flows still verified only
      by hand: the runaway-timer choice end to end, entry editing
      round-tripping local wall-clock through UTC and the overnight case,
      responsive layout at 375px and 1280px, and the accent rule in rendered
      pixels rather than class strings.

      Add them one at a time and only where breakage would be silent —
      a suite that fails randomly gets ignored, which is worse than not
      having one.

- [ ] **Collapse the nav on narrow widths instead of scrolling it.** At 375px
      the last sections sit past the right edge, so reaching Invoices means a
      horizontal swipe on a strip that does not look scrollable. Nothing is unreachable and the running timer is unaffected
      (it lives in the identity row, deliberately separate from the scrolling
      strip), but a section you cannot see is a section you will not visit —
      and the answer is not to stop adding sections.

      Collapse rather than scroll. Options, in rough order of preference:

      - **Icons only** below the breakpoint where labels stop fitting. The
        five current sections fit 375px comfortably as icons, with room to
        grow. This is the one case where icon-only nav
        is defensible on a phone — the alternative is a label you cannot
        reach — but each needs a real `aria-label`, and the current-section
        marking has to survive losing its text.
      - **A menu behind a single control**, which scales past six items but
        costs a tap on every navigation and hides where you are.

      Prefer the first; it keeps the sections visible, which is the property
      being defended. Note this is the same breakpoint question as the
      collapsible rail below, and the two should share a decision about what
      collapsed nav looks like rather than inventing two answers.

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

      Single-line rows are what make a dense list scannable, so the wide
      layout should stay as it is; the argument is only about narrow screens,
      where hiding billing-relevant fields is worse than wrapping and the list
      is short enough that density is not the constraint.

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

- [ ] **`/stats` has no handler tests, and it computes all the money on the
      home screen.** `home-cards.test.tsx` stubs the entire response, which is
      exactly the failure mode that let the invoice detail page ship broken —
      the stub and the component agree and the route is free to be wrong.
      Untested: the 7-day overdue grace period, `buildPace`'s divide-by-zero
      guard, `MAX_UNBILLED_ROWS` truncation, `awaitingPayment` summing `sent`
      only, and `businessDaysInLocalMonth` (which has no unit test either).

- [ ] **`unbilled_by_client` is a third rate-resolution implementation and is
      untested.** Its own header says the coalesce chain must stay identical
      to `resolve_entry_rate`, and nothing enforces that. The grouping by
      `(client, rate)` is the rule whose absence once reported $1,755.00
      where $1,462.50 was owed — the seed reproduces the case, but no test
      asserts on it. Seed one client at two rates and assert the rollup
      agrees with `buildLineItems` over the same entries.

- [ ] **Two snake↔camel converters.** `invoicing.ts` has its own `toInvoice`,
      `toLineItem` and `ClientRow` alongside `rows.ts`, and `toLineItem`
      takes `Record<string, any>` so nothing type-checks it. That is where
      `rateSource` drifted. Consolidating them removes the seam; until then a
      field change means editing both.

- [ ] **`POST /invoices` and `/preview` leak `entryIds` per line item**, and
      `POST /invoices` returns `lineItems` + `entryCount` while `api.ts`
      declares plain `Invoice`. Internal entry ids are in no documented shape.
      Decide whether they are part of the contract or should be stripped.

- [ ] **Destructive and money mutations fail silently.** Archive client,
      archive project and `makeDefault` have no `onError` and render no
      error, so a rejected request leaves the button live and the UI
      unchanged — it reads as "the click didn't register". The codebase
      already has the pattern (`client-form.tsx`, `project-dialog.tsx`,
      `invoice-new.tsx` all render `save.error` with `role="alert"`); these
      skipped it.

- [ ] **`entry-dialog` is stricter than the server about locked entries.** It
      disables every field when `invoiceId` is set, but the server locks only
      when the invoice is **issued** — a draft-billed entry stays editable
      (`invoices.test.ts` covers that). Either the UI is wrong or the rule
      is, and the test passes `invoiceId` with no status so it cannot tell.

- [ ] **Duplicated empty-state primitives, already drifting.** `Empty` in
      `client-list.tsx` and `invoice-list.tsx` are byte-identical;
      `Placeholder` in `entry-list.tsx` is the same but `py-8`. Two `Shell`
      back-link layouts likewise. The drift has already happened, which is
      the state just before someone unifies them in the wrong direction.



- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because the route tests inject `__TEST_DB__` and never take that path.
      Worth a test that hits a real server with a real token before the Expo
      or macOS app depends on it.

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
