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

- [ ] **The menu bar panel names no client.** `menubar.html` draws the client
      NAME under the task while a timer runs ("Northwind Trading" beside its
      dot), where the panel now shows the project alone. The colour is
      resolved; the name needs `Client.name` decoding and a second line under
      `RenameRow`. Cheap, but it is another line in a 320pt panel — worth
      confirming it earns the height before adding it.

- [ ] **The menu bar app sets type in the system font.** `menubar.md` asks
      for IBM Plex, shipped with the app. `TypeRole` in `ContentView.swift`
      has the two lines where the family lands; the fonts need vendoring as a
      SwiftPM resource and registering at launch.

- [ ] **Settings as a pushed view in the menu bar panel.** `menubar.html`
      specifies it — runaway threshold, shortcut, show time in bar, launch at
      login, with the account block beneath. The gear opens a `Menu` today.

- [ ] **The web sign-in sets the word instead of drawing the mark.**
      `signin-form.tsx` has `<h1 className="type-title">Stint</h1>`, so it
      renders in the sans title role with no bounds. `brand.html`'s placement
      table has no row for it, which is the reason it was missed — add one
      when it is fixed, and use `<Wordmark />`.

- [ ] **An inbox invoice row does not open.** Clicking the label on an overdue
      or stale-draft row in the dock's inbox goes nowhere. The `href` is
      `/invoices/${invoiceId}` and the detail page exists, so the fault is in
      between — diagnose before writing the fix; candidates are the link losing
      the click to the row's own handling, the id on the `/stats` row not being
      the invoice's real id, or the detail page erroring and swallowing the
      navigation. See `apps/web/src/components/inbox.tsx`.

      This is the inbox's whole premise failing: a row is there to be acted on,
      and every one of them names a record whose page is where the decision
      gets made. The inline actions (mark paid, download) are the exception,
      not the route — void and delete deliberately live on the invoice itself,
      so a dead link means those are unreachable from the place that surfaced
      the problem.

- [ ] **A detail page's back link ignores where you came from.**
      `DetailPage` takes a hardcoded `back`, so arriving from the home inbox
      and clicking back lands on `/invoices` — a list you were not on, with
      the row you were reading now one of many.

      All three callers (`invoice-detail`, `client-detail`, `invoice-new`)
      now go through one component, so this is a single change rather than
      three.

      The link is doing two jobs and only one is honest. As **"up"** it is
      correct: an invoice does sit under `/invoices`. As **"back"** — which is
      what the arrow and the position promise — it is wrong whenever the
      referrer was the home screen, and the inbox is a primary entry point to
      exactly these pages.

      Do not reach for `router.back()`: it inherits whatever is on the stack,
      including an external referrer or a page that has since 404'd, and it
      leaves the link with no text to render until it knows. Prefer naming the
      origin explicitly — a `from` query param on the inbox's links, with the
      current hardcoded path as the fallback — so the label says where it
      goes, a direct visit still gets a sensible link, and the destination is
      knowable at render time.

- [ ] **Pace is unreachable until you already know it exists.** `Pace` returns
      `null` when `stats.pace` is null, so an account with no target sees
      nothing on Home, and the only route to one is knowing to open Settings
      and scroll to a field nothing points at.

      Settings owns the field and should keep owning it — the gap is a way in
      from the screen the card would appear on.

      **This is not the "no empty progress bar" rule being overturned.** That
      rule objects to a bar rendered at zero with nothing to say; a single
      line that names what the card does and links to the field is the
      empty-state pattern `/clients` already uses. What it must not become is
      a second target editor, or a dismissible banner — a card you keep
      closing is worse than one that hides.

- [ ] **Record a reminder on a sent invoice.** `last_reminded_at`, so an
      overdue row can read "12 days late · chased 3d ago" rather than either
      nagging unchanged or disappearing. This is the honest alternative to a
      snooze: it records what you did instead of hiding what is true, and
      over time shows which clients need chasing twice. Needs a column, a
      PATCH field, and a third inline action on the overdue row.
- [ ] **Quiet clients in the inbox.** An active client with no entries in 30
      days. It needs a per-client last-entry query, because the rollup only
      returns clients with unbilled work — a quiet one is absent from it by
      definition. Phrase it as an observation, not an alarm: a finished
      engagement is the common cause and archiving is the useful action, so
      the row links to the client.

      It was in `screens/home.html`'s row table for a long time without being built,
      which made the spec claim a row the app did not have. The design lives
      here now and moves into that table when it ships.
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
- [ ] **A showcase in `screens/components.html`** — every button variant,
      filter, badge and card rendered side by side, so choosing one is
      looking rather than grepping. The page currently names the primitives
      and the conventions but shows almost none of them, which is the
      show-don't-tell gap it was written to close.

      **It belongs there, not in `brand.html`.** The two answer different
      questions: `brand.html` is what the system *is* (the mark, the scale,
      what green means) and is read once when deciding; `components.html` is
      what to reach for, and is read every time a screen gets built. The test
      is which file adding a component would edit — a `variant="ghost"`
      button is an assembly choice, where a type role is the brand itself.

      Cover the six `Button` variants at their four sizes, the filter pill in
      both states, `StatusBadge`'s five statuses, `SaveIndicator`'s four, and
      `Panel` with and without an edge. Name the token each uses, since the
      point is picking one rather than admiring it.

- [ ] **Icons on the remaining buttons.** Nav and the additive actions have
      them; the lifecycle buttons on an invoice (send, mark paid, void,
      download) and the settings forms do not.

      Clients is done and is the pattern: `Check`/`Loader2` on a submit,
      `Pencil` on edit, `Archive` on archive, every glyph `aria-hidden` so
      the accessible name stays the label, and Cancel deliberately bare.
- [ ] **Light mode.** The palette already exists: `tokens.css` emits the full
      light ramp under `[data-theme="light"]`, the mirrored curve
      (`L = 0.985 - 0.840 * t^1.55`) is derived, and `docs/design/deriving-colour.md`
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
      - The shadows differ too (`docs/design/deriving-colour.md`: light uses
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

- [ ] **A write accepts another user's `project_id`.** `POST /timer/start`
      with a project belonging to a different account returns 201 and stores
      the reference — verified against the local stack with a real bearer
      token. RLS protects every READ, so the entry then renders with no
      project name, but the row is wrong in the database rather than merely
      displayed wrong.

      Found because the macOS app held a stale `draftProjectID` across a
      `dev:reset` that reseeded under a different user. That is the benign
      version; the same hole accepts a deliberately supplied id.

      `time_entries.project_id` has a foreign key, which is why this is not
      caught: the row genuinely exists, it just is not the caller's. The fix
      belongs in the database rather than each route — a check that the
      referenced project's `user_id` matches — because `/timer/start`,
      `PATCH /timer` and `PATCH /entries/:id` all write the column and a
      route-level check would need repeating in three places and would be a
      race besides. `rls.test.ts` is where the assertion goes.

- [ ] **Two snake↔camel converters.** `invoicing.ts` has its own `toInvoice`,
      `toLineItem` and `ClientRow` alongside `rows.ts`, and `toLineItem`
      takes `Record<string, any>` so nothing type-checks it. That is where
      `rateSource` drifted. Consolidating them removes the seam; until then a
      field change means editing both.

- [ ] **`POST /invoices` and `/preview` leak `entryIds` per line item**, and
      `POST /invoices` returns `lineItems` + `entryCount` while `api.ts`
      declares plain `Invoice`. Internal entry ids are in no documented shape.
      Decide whether they are part of the contract or should be stripped.



- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because the route tests inject `__TEST_DB__` and never take that path.
      Worth a test that hits a real server with a real token before the Expo
      or macOS app depends on it.

- [ ] **Calendar: a block can overlap the day's label.** Visible on Saturday
      in the seeded week — "Untitled" is clipped by the block above it.
- [ ] **Calendar header weight mismatch.** `type-title` at 24px/600 sits next
      to a mono readout and the pairing reads unbalanced.
- [ ] **Route handlers validate against a second copy of the schema.** Every
      handler under `api/v1/` defines its own local Zod schemas and none
      imports `@stint/schema` — `invoices/preview/route.ts` has a
      `PreviewRequest` duplicating the schema's `InvoicePreviewRequest`, and
      `invoices/route.ts` a `CreateInvoice` duplicating its `CreateInvoice`.

      The browser half is already done: `lib/client/api.ts` derives its
      response types from `@stint/schema` rather than copying them. Requests
      are the remaining direction.

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
- **macOS: Sign in with Apple.** The app signs in with an emailed six-digit
  code today, which works but is still six digits to type.
  `signInWithIdToken` needs a paid developer account, an App ID with the
  capability and a signed bundle — so it lands with distribution, not before.
  Nothing in the API changes.
- **macOS: signing and notarisation.** `bundle.sh` produces an unsigned
  `.app`, which is fine to run yourself and not something anyone else can
  open without right-clicking past Gatekeeper.
- **macOS: a global hotkey to start and stop.** The reason to have a menu bar
  app at all is not reaching for the mouse, and the panel still needs a click.
- **Expo app** — last by design; reuses the most.
- **Runaway timer push notifications** — needs APNs/FCM, so effectively gated
  behind the native apps.
