# Tasks

Everything wanted and not yet built, in one file. The only file — two lists
means one of them is stale and you cannot tell which. The shape is a cut: the
sections above **Deferred** are the alpha critical path, and **Deferred** is
everything else that is still wanted.

**A finished task is DELETED, not ticked.** A file of completed work stops
being a to-do list and becomes a changelog that nobody updates; git already
records what shipped, and `CLAUDE.md` records why. If a line no longer
describes something we intend to do, delete it — including because we decided
against it, in which case the refusal belongs in `docs/design/principles.md`
where it will be read before being re-proposed.

Within the critical path, sections are about readiness rather than priority:
**Ready** needs no decisions and **Rough edges** are the known faults. A line
moves out of **Deferred** when the alpha is out or its gate lifts.

Everything here has been measured against the thesis in
`docs/design/principles.md`: *does this help a solo contractor track time and
get paid?* Ideas that failed that test are recorded there as refusals, not
here. A line is not a commitment to ship — it is a commitment to have already
thought about the hard part, so the decision is not re-litigated from scratch
later.

## Ready



- [ ] **Inbox rows become cards, and the colour rail goes.** The rows are
      borderless bands on the panel's own ground, separated by a 2px left rail
      that is coloured on the overdue row. `screens/floating-frame.html` draws
      something else entirely: each row is **its own raised surface** —
      `bg-surface-elevated`, ~7px radius, ~9px/10px padding, a 6px gap between
      cards — with **no border on any edge**. Convert to that.

      It is the four-plane rule doing the work the rail was standing in for: a
      card that floats off the panel is separated by depth, so it needs no
      edge to say where it ends. The rail exists because the rows had no
      surface to be distinguished by — remove the reason and it goes with it.

      Also in the spec's drawing and not in the code:

      - **The count is a pill**, not bare text — mono, ~17px round,
        `bg-surface-elevated`. `inbox.tsx:144` renders it as plain
        `type-meta`.
      - **The actions are outlined**, `1px solid` at ~5px radius, rather than
        the current bare text that only draws a surface on hover. On a raised
        card a hover-only control has nothing to sit against.

      **Danger stays, on the figure.** `tone === 'danger'` currently colours
      the rail and the subtitle; with the rail gone it belongs on the value
      and the copy — the spec's `.tone-danger` is a text colour, applied to
      "20 days late", not to a container. The distinction between an overdue
      invoice and an unprojected entry must survive the conversion.

      Check the exit animation in the same pass: `exit-collapse` collapses a
      row's height on dismiss, and a card with its own margin collapses
      differently from a flush band — the gap has to go with it or rows jump
      as one leaves.

      Wanted for alpha.
- [ ] **One figure for today's earnings, from the server.** Home answers
      "what has today been worth?" twice, in two places, by two mechanisms,
      and neither answers it directly:

      - **"Since yesterday, +$90.40 unbilled"** in the panel header
        (`SinceLine` in `home-cards.tsx`), which is `sinceOpen` — the unbilled
        total snapshotted in `localStorage` when the app was first opened
        today, differenced against now.
      - **The transient `+xyz` beside the unbilled number** after an edit,
        reporting what that one change did.

      Replace both with a single **server-computed amount for today**, shown
      near the unbilled figure it describes rather than in the panel header.
      Today is a property of the data, not of this browser: work dated today
      at its resolved rate, the same definition `principles.md` already fixes
      for revenue — *work done, bucketed by the entry's date*. It reads the
      same at 9am and at midnight, on a laptop and a phone, on a first visit
      and a fiftieth.

      **This deletes `use-day-state.ts`, and that is the point.** Roughly 380
      lines exist to make a client-side snapshot behave: folding beats,
      classifying causes, dropping the snapshot when the timezone changes so a
      zone difference is not reported as money earned, suppressing the line on
      first load because there is nothing stored to compare. Every one of
      those is a problem the snapshot creates and a server figure does not
      have.

      **`use-count-up.ts` stays, and both figures use it.** It is a separate
      thing from the snapshot and worth keeping: the unbilled total counts up
      to its new value, and today's earnings counts up to its own. A figure
      that lands without travelling reads as though the previous one was
      wrong, which is the whole argument in that file's header.

      **Both use `useSinceLastSeen`**, under their own keys — not one on it
      and one on the plain `useCountUp`. It animates from what this browser
      last displayed, which is honest for either figure: the money moved while
      you were away, and the travel is what says so. Two figures side by side
      animating on different rules would read as a bug in the one that sat
      still.

      Its first-load guard covers the morning case for free: with nothing
      stored the figure renders settled rather than counting up from zero, so
      the day's first visit does not replay the whole amount.

      What the new number is NOT: not `sinceOpen`, which moves when you
      invoice something (hence its "−$X invoiced" branch) and so mixes work
      done with paperwork filed. Today's earnings do not fall when you raise
      an invoice.

      `Stats` has no field for it — `unbilled` and `velocity` are both
      windows, not days — so this adds one, computed in the same rollup with
      `resolve_rate()` like every other amount. `tz` decides which day, the
      way it already does everywhere else.

      **Unrated entries make it incomplete, not low.** `UnbilledClient` already
      carries `unratedCount` for exactly this; today's figure needs the same
      honesty rather than silently omitting work with no resolvable rate.

      Wanted for alpha.
- [ ] **The menu bar panel keeps its focus between openings.** Open the panel,
      click into the task field, close it, reopen: the field is still focused,
      so the panel never opens in a default state. Escape closes the panel
      correctly — that part works and should stay.

      **`@FocusState` is not the lever, and this is the finding worth keeping.**
      Instrumenting `TimerPanel` and driving the panel with real keystrokes
      logged `onAppear focused=false` / `onDisappear focused=false` while the
      field was visibly focused. The AppKit field editor holds first responder
      and the SwiftUI binding never sees it, so setting `taskFocused = false`
      on dismiss clears something that is already false. The lifecycle hooks
      themselves do fire — `.window` keeps the view alive between openings and
      `onDisappear` runs as a visibility toggle.

      `NSApp.keyWindow?.makeFirstResponder(nil)` in `onDisappear` is in the
      code now and does not fix it either — probably because the panel is no
      longer key by the time it runs, which is the next thing to test.
      Candidates after that: hold the panel's `NSWindow` and clear its
      responder before dismissal, or a `MenuBarExtraAccess`-style lookup of
      `NSApp.windows` for `MenuBarExtraWindow`. Three attempts have gone into
      this; it wants fresh eyes rather than a fourth variation.

- [ ] **Onboarding: teach the shape, never fabricate a record.** A new
      account's timer screen has nothing on it, and the least discoverable
      thing in the data model is that `client_id = null` is how unbillable
      work is tracked — nobody guesses that. "No projects yet." is the most
      discouraging string in the app.

      - **Seed an `Internal` project with no client** in
        `create_default_settings`, so the picker is not empty on first open
        and the null-client path is demonstrated rather than explained. It is
        a project and never a client: clients go on invoices and appear in the
        picker, the calendar legend and the unbilled rollup, so a non-customer
        sitting in the client list is exactly the confusion the null-client
        path exists to avoid.

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
- [ ] **Adjusting a runaway focuses the task name, not the end time.** The
      `EntryDialog` at `timer-bar.tsx:171` passes no `focus`, so it falls to
      the default `'task'` — which is right when the dialog is opened to edit
      an entry, and wrong on this path. A runaway is a timer left running: the
      task name is the one field already correct, and the end time is the only
      reason the dialog opened. `focus` takes `'task' | 'project'` today, so
      this adds `'end'` and passes it from the runaway path alone.

      Two things the existing `focus === 'project'` case has already solved,
      and this must copy rather than rediscover. The `noAutofocus` lint rule
      needs the same `biome-ignore` with the same reasoning — the rule guards
      against stealing focus on page load, and this is a modal the user just
      opened where something must take focus anyway. And the `focus:` styles
      must be there alongside `focus-visible:`: programmatic focus is never
      `:focus-visible`, so without it the cursor is genuinely in the field
      with nothing on screen saying so. `Input` is shared, so check whether it
      carries those already before adding them at the call site.

      Worth deciding while in there: whether the time is also **selected**,
      not merely focused. The field exists to be replaced rather than edited,
      and a `type="time"` input focuses its first segment — which is the hour,
      the segment most likely to be the one that needs changing.

- [ ] **The menu bar pip shifts with the width of the clock.** It should sit
      still: it is the one thing in the bar that is always in the same place,
      and a dot that moves as the digits change is motion with no meaning
      behind it.

      **The obvious fix is already in place and is not enough.**
      `StintApp.swift` gives the text a 57pt `.frame(alignment: .trailing)`
      and `.monospacedDigit()` precisely so 9:59:59 → 10:00:00 cannot slide
      the pip. So the movement is not the text moving inside its slot — it is
      the status item's own width changing and the system re-laying out from
      the right edge, which moves everything left of it. Diagnose before
      changing the number: confirm whether the item's width is actually
      constant, since a `MenuBarExtra` label sizes to its content and 57pt is
      a guess that may not match what the font renders at every digit count.

      Candidates, cheapest first: trailing-align the whole label rather than
      the text alone; measure the true widest string in the rendered font
      instead of hardcoding 57; or pad the clock to a fixed character count so
      the string length never changes at all. The last is the only one that
      does not depend on layout behaviour we do not control — but it must pad
      with a figure space or a leading zero, never by rewriting what the clock
      says.

      **Remember this is a `.app` rebuild to see**, not `swift build` alone —
      the running copy is the bundle in `~/Applications`. `docs/macos.md`.

- [ ] **Review every loading state under a real network.** Starting and
      stopping the timer is noticeably clunky in production and smooth
      locally, which means the states were only ever seen at localhost
      latency — where a round trip finishes before a spinner can render. The
      method is to force a delay (~1s, and a slow case around 3s) and walk the
      app: every mutation, every `Listing`, every screen transition, watching
      for an unannounced freeze, a spinner that flashes for 80ms, and layout
      that jumps when the real data lands.

      **The timer bar is the specific case and the reason this is Ready.**
      `useTimer`'s `start` and `stop` have no `onMutate` — nothing in the app
      does — so the bar shows the old state for the whole round trip *plus*
      the `invalidateEntryData()` refetch that follows, and `busy` only
      disables the button. Pressing start does nothing visible for two
      sequential requests. The two candidate fixes are an optimistic
      `onMutate` on the timer cache, and returning the new state from the
      mutation so the second round trip is not on the critical path.

      Two rules constrain the fix. **The server owns timer truth**, so an
      optimistic start is a local render that a 409 or a failure must be able
      to take back — never a local timer that outlives the server's answer.
      And the accent marks the running timer: whatever renders between press
      and confirmation must not claim green for a timer that is not running
      yet.

      **The menu bar app has the same fault and is covered by this task.**
      `TimerModel.toggle()` awaits the mutation and then `await refresh()`,
      the same two sequential round trips, and `isBusy` only dims the control
      to 0.6 — so the panel shows the old state throughout. It needs walking
      under the same forced delay: toggle, the project picker, resume, the
      rename commit, and sign-in, which is the slowest thing the app does and
      the first thing a new user sees. The bar itself is the harder half: it
      is a pip and a clock with no room for a spinner, so a press that takes a
      second has to be legible in two objects that are already saying
      something else.

      A delay long enough to see is also what makes the states *testable* —
      several of them have probably never rendered on this machine at all.

- [ ] **`paid_at` records when the user clicked, not when the money arrived.**
      Nothing asks, so the timestamp is whenever they next visited
      `/invoices`. Any average built on it measures the user's habits.

      **Ask for the date when marking paid, defaulting to today.** One field on
      a control that already exists, and the whole correctness of the metric
      below.

      **The row carries how long ago it was sent** — "sent 34 days ago" is
      what makes it worth reading rather than merely present, and it is the
      same aging insight Unbilled already leans on.

      **It snoozes, defaulting to daily, with a dropdown for longer.** Checking
      a bank balance is a real errand and a daily nudge is wanted; what the row
      must not do is sit there permanently true with no way to say *not yet*.
      This is the one row that snoozes — `principles.md` carries the
      distinction and the reason.

- [ ] **Home: hours or revenue by PROJECT, beside the heatmap.** The panel is
      entirely client-shaped — Velocity splits by client, By-client ranks
      them, the heatmap colours by them — and `stats.ts` reads `project_id`
      only to resolve which client a row belongs to. So "which project ate
      the month" is a question the screen cannot answer, and it is the one
      where the answer is regularly a surprise. That gap is the reason to
      build it.

      **Grouped by project, never by client.** A by-client bar chart would
      draw Velocity's data a second time, and one question answered twice in
      one panel is the disjointedness the frame removed.

      **One control: hours or revenue.** A genuine either/or — hours answer
      where the time went, revenue what it was worth, and a project can rank
      high on one and low on the other, which is the insight. Same shape as
      Velocity's figure-and-keyline, so it reads as a sibling.

      **No timeframe picker; inherit Velocity's trailing window.** Two
      regions side by side on different windows invite a comparison that is
      not valid. A picker also multiplies the states this screen has to be
      designed for, which is the refusal `principles.md` records as *Home is
      one view*.

      **This needs API work**, unlike most of the home cards: a SQL aggregate
      grouping by project through `resolve_rate()`, a `byProject` shape in
      `@stint/schema` and `buildVelocity`'s neighbour in `stats.ts`. A new
      aggregate is proved against a real Postgres before anything is built on
      it — a project with no client, a NULL rate at every level, and two
      projects sharing a name under different clients are the rows that will
      find the bugs.

      **It takes half a row, and the heatmap gives up the other half.** The
      heatmap is full-width today because nothing else was ready to sit
      beside it, not because it needs the width. At `@2xl` the pair is
      `1.15fr 1fr`; the chart takes the wider half, since bars with project
      names need more room than a year of 9px cells.

- [ ] **Stopping the timer moves Unbilled on the stop response.** In the menu
      bar panel, `toggle()` discards what `stopTimer()` returns and waits on a
      full `refresh()` — `/summary`, then `/stats`, then `/entries`, issued
      serially (`TimerModel.swift:206`, `:155-184`). Unbilled therefore sits
      still for two sequential round trips after the press. Return the new
      unbilled total from `POST /timer/stop` alongside the entry, and the
      panel has the number it needs from the call it already made.

      **The rate chain stays server-side, which is the point.** Unbilled is
      `unbilled_by_client` resolving `rate_override → project → client → user
      default` and rounding per (client, rate) bucket. A client predicting its
      own delta would be a third implementation of a chain `CLAUDE.md` already
      requires two copies of to agree, and Swift has only `Project.hourlyRate`
      locally — no client or user-default fallback. Computing it in the stop
      route reuses `buildUnbilled`.

      Animating it is one line. `statistic()` already carries
      `.contentTransition(.numericText())` (`ContentView.swift:383`) and it is
      inert, because nothing wraps the assignment in an animated transaction —
      `withAnimation` around the state change is the whole fix. That is a digit
      roll, not the web's 160ms sweep through the intervening amounts; the roll
      is the more native of the two on macOS and needs no ticker. The running
      readout is still never animated (`tokens.json:669`).

      `stats` is `private(set)` and `refresh()` replaces it wholesale, so the
      figure from the stop response wants folding in rather than written over
      the old object — the next refresh lands seconds later and would otherwise
      fight it. `refresh()` is also unguarded against the 60s poller running
      concurrently, so reconcile against the refresh that was started here, not
      whichever one finishes last.

      Web gets it free and does not need it: `useCountUp` already tweens on any
      change of the target, and its two round trips are the same two. Doing the
      panel first keeps the change to one client.

      `docs/api.md:25` is the contract that moves.

## Rough edges

- [ ] **The local database drifts behind the migrations.** `pnpm migrate`
      reads `.env.local` and reaches the hosted project; the Supabase CLI owns
      the local one. Nothing routinely applies a new migration to local except
      `pnpm dev:reset`, which rebuilds from `seed.sql` and takes the local
      data with it — so the working answer is "lose your data" and the drift
      accumulates instead.

      It reached four migrations behind before a 500 surfaced it, and one of
      those had been applied by hand without being recorded, so the CLI's
      tracking table disagreed with the schema in both directions.

      Wanted: something that applies what is missing to local, additively.
      `scripts/migrate.mjs` already takes `--url` and tracks `schema_migrations`
      itself, so the shape may be a `dev:migrate` that points it at
      `:54322` — but the CLI keeps its own `supabase_migrations.schema_migrations`,
      and two tables tracking one database is how this got confusing. Decide
      which one is authoritative before writing it.

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

- [ ] **Drop `projects.color`.** Nothing selects or writes it, and a project
      takes its colour from its client — the column is the only thing in the
      repo claiming otherwise. It has shipped, so this is the second release
      of a two-release retirement: a migration of its own that drops the
      column and touches no code.

- [ ] **`POST /invoices` and `/preview` leak `entryIds` per line item**, and
      `POST /invoices` returns `lineItems` + `entryCount` while `api.ts`
      declares plain `Invoice`. Internal entry ids are in no documented shape.
      Decide whether they are part of the contract or should be stripped.

- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because the route tests inject `__TEST_DB__` and never take that path.
      Worth a test that hits a real server with a real token before the Expo
      or macOS app depends on it.

## Deferred

Two kinds of thing sit here. Some wait on something outside the code — an
account to upgrade, a service to enable, history that only accrues with real
use. The rest are wanted, designed and unblocked, and simply sit outside the
alpha. Both keep their full working, so whichever gate lifts first, the thinking
is already done.

### Waiting on something outside the code

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
- **macOS: signing and notarisation.** `bundle.sh` self-signs with a local
  identity, which is fine to run yourself and not something anyone else can
  open without right-clicking past Gatekeeper.
- **Runaway timer push notifications** — needs APNs/FCM, so effectively gated
  behind the native apps.

- **Days-to-payment, once there is history.** `sent_at` to `paid_at`,
  trailing, per client. "Northwind pays in 12 days" is unknowable from
  memory and turns the awaiting-payment line from a fact into a forecast —
  *$1,905 out, typically back by the 28th* — which is cash-flow
  information rather than decoration.

  **Blocked on `paid_at` recording when the money arrived**, and on real
  paid invoices existing: `seed.sql` has none, so this cannot be rendered
  against seeded data.
  Needs a stated minimum sample before it speaks — one invoice is not an
  average — and it says nothing rather than guessing below it.

### Outside the alpha

- **Standardise how a clickable thing looks.** `components.html` names
  the primitives but says nothing about what a hover, a press or a
  selected row looks like, so each was decided where it was written and
  they have drifted. The Today rows are where it shows worst: the
  highlight is a full-bleed band with **sharp corners and no horizontal
  padding**, so the surface runs edge to edge inside a card that is
  rounded and inset everywhere else.

  What is there now, for the same gesture — click a row, open the thing:

  | Where | Shape |
  | --- | --- |
  | `entry-list.tsx:167,185` | no rounding, `px-1` — the full-bleed band |
  | `inbox.tsx:480` | `rounded-r-md`, no left rounding (a colour rail) |
  | `app-header.tsx:23` | `rounded-md px-2 py-1` |
  | `nav.tsx:87` | its own rounding and padding |
  | `client-list.tsx:94` | neither |

  Decide the shape once, write it into `components.html` as a convention,
  then apply it. The likely answer is an inset radius with real horizontal
  padding, so a highlight reads as a row lifting off the card rather than
  a stripe painted across it — but the point is that it is decided once
  and recorded, not that it is that particular value.

  Cover the states together, since a row that only hovers is half a
  control: hover, active/pressed, keyboard focus (**neutral ring, never
  the accent**), selected where it applies, and disabled. Focus is the one
  already constrained and the one already broken —
  `focus-visible:ring-edge-focus` is on some of these and not others,
  which is a bug rather than a style drift.

  **This list is not finished.** Add rows as they turn up; the above is
  what a sweep of `hover:bg-surface-*` found, so it misses anything
  hovering by colour alone, anything using `group-hover`, and every
  clickable element in the macOS panel — which has its own `Hovering`
  wrapper and the same question to answer.

- **Review the app for keyboard operation, then make it teach itself.**
  The audience is other contractors who write software, and for them a
  tracker that needs the mouse is a tracker they resent — the whole point
  is that logging time should cost nothing. Two halves, in order: what
  can be done from the keyboard at all, then whether anything on screen
  ever says so.

  **The second half is the one that is missing entirely.** Nothing in the
  web app renders a keystroke. What keys exist are local to the control
  that owns them — the task-suggest combobox takes arrows, Enter and
  Escape, and two fields commit on Enter — so every one of them is found by
  guessing. A shortcut nobody
  can discover is a shortcut nobody uses, so the review is worthless
  unless what follows it puts the keys on screen: in menu rows beside the
  item they trigger, in tooltips, next to the primary action in a dialog.
  `DropdownMenuShortcut` is already vendored in `dropdown-menu.tsx` and
  used nowhere, which is the slot for the menu half.

  Review first, and write down what is found — the actions worth a
  binding, what is already reachable by Tab, and what is silently not.
  Radix gives arrow keys, typeahead, Escape and focus return inside menus
  and dialogs for free, so the gaps will be in our own code: the timer
  toggle, the inbox rows, the entry list, the filter pills, anything
  built as a `div` with a click handler.

  Three things to decide during the review rather than after:

  - **What earns a binding.** Start/stop is obvious. Beyond that the bar
    is the same one the nav has — a shortcut that exists because it could
    is a key the user must now avoid pressing by accident.
  - **Whether a shortcut overlay belongs here** (`?` listing everything),
    which is the discoverable answer for the bindings that have no
    natural home on screen. It is also a surface that goes stale
    silently, so it only works if it reads from wherever the bindings are
    defined rather than being a hand-kept list.
  - **What a binding must not break.** Nothing may fire while a text
    field has focus — the task name field is where the user spends their
    typing — and none of it may collide with the browser's own keys.

  **Focus rings stay neutral, never the accent** (`brand.html`), which
  constrains how this is shown before it is designed.

  This is the web app. The menu bar app's own global hotkey is in
  Deferred, and judging Tab reachability there needs macOS keyboard
  navigation turned on first.

- **Extend the end-to-end suite.** Sign-in, sign-out and the invoice
  lifecycle are covered (`pnpm test:e2e`). The flows still verified only
  by hand: the runaway-timer choice end to end, entry editing
  round-tripping local wall-clock through UTC and the overnight case,
  responsive layout at 375px and 1280px, and the accent rule in rendered
  pixels rather than class strings.

  Add them one at a time and only where breakage would be silent —
  a suite that fails randomly gets ignored, which is worse than not
  having one.

- **`/reports` — the destination those numbers point at.** "Which 120
  hours?" is a missing *destination*, and one view answers it at project,
  client and date-range level from several entry points. Filters live in
  query params so a link is shareable and Back works. Hours per project is
  its first content, and the project row links to it.

  **"Reports" is a word that attracts scope** — Toggl's reports tab is
  most of what made it feel bloated. The guard is the existing bar on
  content, not on the nav entry: a view ships only if it carries a number
  the user cannot compute in their head, or rows they can act on. Hours
  per project passes. "Time by day of week" does not.

  **It is also where the two held-back cards belong.** Week-over-week
  deltas and the time-of-day heatmap each still carry an open question,
  and both were held partly because they would clutter home; an
  analytical view is their honest home, so it should absorb that class of
  question rather than let the home screen grow a fourth card. That is an
  argument for building it.

  *Open question, to answer once there is real data:* does `/reports`
  **supersede** those two cards or merely host them? Leaning supersede — a
  week-over-week delta is something you go and look at deliberately, not
  something that should interrupt the screen opened fifty times a day.

- **Hours invested per project — blocked on `/reports` existing.** The app
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

- **Effective hourly rate — not on Home, and not in the first cut.**
  Money divided by *all* hours including unbillable. Bill $150, absorb 20%
  admin, and the real rate is $120: uncomputable in the head, and the
  number that makes unbillable time visibly expensive.

  **It needs a denominator that grows, and most users will not give it
  one.** Unbillable work against a client is the only thing that moves it,
  and someone who does not log admin at all sees their headline rate
  forever — a figure that fails the change test on every check, for the
  accounts most likely to see it.

  It belongs in `/reports`, where a figure is looked up deliberately rather
  than glanced at fifty times a day, and where a flat number is a finding
  rather than dead space.

- **Week-over-week deltas.** *Question: what threshold makes it fire
  rarely enough to be worth reading?* On lumpy contract work a 40% drop
  usually means a client's sprint ended, and a delta that is noise most
  weeks trains you to ignore the one week it is real. Compared against a
  **4-week median** and suppressed below a threshold it could mean
  something — but the threshold is empirical and needs real data. If it
  ships it is a line inside Velocity, not a card — that is where a
  month-over-month reading now lives.

- **Time-of-day heatmap.** *Question: does the billable/unbillable split
  actually vary by hour enough to see, on a real dataset?* Plain volume by
  hour is interesting and changes nothing — the calendar week already
  shows that shape. Crossed with billability it might yield "your
  unbillable time clusters between 9 and 11am", which is actionable. If
  admin turns out to be scattered evenly through the day, the card has
  nothing to say and should not ship. Check before building.

- **The quarter as a first-class period.** *Question: does the app report
  cash received, when every number in it today reports work done?* A US
  contractor pays estimated tax four times a year on **money actually
  collected in that quarter**, and that is the one figure the app cannot
  currently produce. Answer this before building anything below it.

  It is a real hole in "track time and get paid": paying the tax is part
  of getting paid, four deadlines a year, and the number is sitting in
  this database already. Toggl is no argument against it either — this is
  not project management, it is the contractor's own year.

  **The conflict is a principle, not a schema gap.** `principles.md`:
  *revenue is work done, not money collected, and it is bucketed by the
  entry's date rather than the invoice's* — written so a bar does not
  drop when a client pays late. Tax is the exact inverse: the IRS wants
  the date the money arrived, so a quarterly figure must bucket by
  `paidAt`, which no view does. Both are correct for their own question,
  which is why this needs deciding rather than assuming — and if it ships,
  the two numbers must be labelled so precisely that nobody reads one as
  the other. That framing is also the guard against scope: this reports
  what happened, it does not compute what is owed.

  **Not tax advice, and not a tax product.** No rates, no estimates, no
  safe-harbour maths, no filing. The app puts the contractor's own numbers
  in the shape their accountant or their 1040-ES asks for, and stops. That
  line is what keeps this from becoming the thing the thesis refuses.

  Candidates, if the answer is yes:

  - **A date filter on `/invoices`.** The list filters by status alone
    today, so "what did I invoice last quarter" is unanswerable without
    scrolling. Quarter presets plus a range, in query params so the link
    is shareable. Cheapest, useful even if nothing else here ships.
  - **Collected-per-quarter**, summing `total` over invoices with `paidAt`
    in the quarter. The estimated-tax number, and the one that needs the
    naming care above.
  - **Quarter over quarter**, once four quarters exist. The comparison a
    contractor actually makes, and one a month cannot show.
  - **An export for the accountant** — invoices with issue date, paid
    date, client and total, as CSV. Probably the highest value per line of
    code here, since it ends with someone else doing the work.

  Note the refusal that stands regardless: **no quarter *targets*** — a
  contractor thinks in months because invoicing is monthly. Reporting a
  quarter and setting a goal against one are different things, and only
  the first is in question.

  Where it lives is `/reports`, which does not exist yet. That is the
  other reason it waits.

- **Record a reminder on a sent invoice.** `last_reminded_at`, so an
  overdue row can read "12 days late · chased 3d ago" rather than either
  nagging unchanged or disappearing. This is the honest alternative to a
  snooze: it records what you did instead of hiding what is true, and
  over time shows which clients need chasing twice. Needs a column, a
  PATCH field, and a third inline action on the overdue row.

- **Quiet clients in the inbox.** An active client with no entries in 30
  days. It needs a per-client last-entry query, because the rollup only
  returns clients with unbilled work — a quiet one is absent from it by
  definition. Phrase it as an observation, not an alarm: a finished
  engagement is the common cause and archiving is the useful action, so
  the row links to the client.

  The design lives here and moves into `screens/home.html`'s row table when
  it ships.

- **Import selected calendar events as time entries.** *Question: is this
  worth a stored OAuth credential and a third-party dependency — and if
  not, is there a shape that avoids both?* A contractor's meetings are
  billable work that never gets tracked, because starting a timer for a
  30-minute call is the thing nobody remembers to do. The calendar already
  knows it happened.

  It passes the thesis on its face: a meeting you attended and did not
  bill is money lost, so this helps a solo contractor get paid. What it
  costs is the open question.

  **Selected, never automatic — that is the whole design.** A calendar
  holds dentist appointments, holidays and meetings that were cancelled
  and not deleted. Anything that imports on a schedule writes billable
  records the user did not approve, which is the same rule that stops
  runaway timers being auto-trimmed. The user picks events and they become
  entries; nothing lands unreviewed. That also means the imported entry is
  an ordinary `time_entries` row, editable and deletable like any other —
  no link back to the source event, no re-sync, no reconciliation.

  **The cost is what the Toggl import deliberately dodged.** That one is a
  file upload precisely to avoid an OAuth app and a stored third-party
  credential, and calendars are worse: the token is long-lived, it reads
  the user's entire schedule, and it is the first thing in this app that
  would need protecting beyond RLS. So decide the shape before the
  feature:

  - **An `.ics` file or URL.** Every calendar exports one and most publish
    a secret subscription URL. No OAuth app, no token, no provider SDK —
    the same argument that made the Toggl import a file. Weakest on
    convenience, strongest on everything else, and it works for Google,
    Apple and Outlook at once rather than one at a time.
  - **Read-only OAuth against one provider.** Better to use, and the thing
    being decided.

  Whichever wins, the mapping is small: event title → `task_name`, start
  and end → the entry's times parsed to an absolute instant (never
  fixed-millisecond arithmetic — an all-day or DST-spanning event is the
  trap), project and billability chosen at import, defaulting to
  unassigned rather than guessed. An all-day event has no duration worth
  billing and should be excluded rather than imported as 24 hours.

  **The timer invariant applies.** An imported event overlapping a real
  tracked entry is the common case — you tracked the call AND the calendar
  has it. Surface the overlap and let the user choose, exactly as the
  Toggl import does; never silently adjust either side.

  And it must not turn the calendar screen into a scheduler. That screen
  *visualises what was tracked and does not schedule* — showing unimported
  events on it would make it a planner, so the import is a deliberate
  action somewhere else, not a second layer on the week.

- **The menu bar app's two dropdowns are system-drawn.** The project
  picker and the account gear are SwiftUI `Menu`s, so their labels carry
  our tokens and type while the list that pops open is AppKit's — system
  font, system colours, system metrics, beside a panel that is ours to
  the pixel. The web's equivalents (`project-picker.tsx`,
  `account-menu.tsx`) are the same two controls built on Radix and themed,
  which is what makes the gap visible.

  **The app is a `MenuBarExtra` in `.menuBarExtraStyle(.window)`**, and the
  two system `Menu`s open without dismissing the panel. A hand-built popup
  has to earn what AppKit gives free, and a picker that dismisses the panel
  when opened is worse than one with the wrong font. Verify against the real
  configuration before building either way.

  **Radix is not available here** — it is a web library, and `apps/macos`
  takes no dependencies beyond the standard library on purpose. So this
  is "matches our theme", built in SwiftUI against `Tokens.swift`: an
  overlay inside the panel's own window, which is also what keeps focus
  where it is. Reach for the tokens the spec's table already assigns
  (`bgBase` for the popover ground, `bgPrimary` for the picker fill).

  What must survive: keyboard selection, typeahead, Escape to close and
  focus returning to the label — everything the system menu gives free and
  a hand-rolled list silently drops. If it cannot keep those, the system
  menu is the better control and this stays as it is.

- **Task name suggestions in the menu bar panel.** *Question: does a
  second way to reuse a name earn its height beside the restart list?*
  The web half ships — `GET /entries/task-names` is live and every client
  inherits it. But `EntryRow` already restarts a prior entry in one click,
  keyboard-free, which is the panel's whole premise, and a 320pt panel
  has no room for two mechanisms doing one job. The panel is drawn and
  badged **Not built** in `docs/design/screens/task-suggest.html`, which
  is what the work would start from. `menubar.html:791-803` needs an
  endpoint row before it lands.

- **macOS: a global hotkey to start and stop.** The reason to have a menu bar
  app at all is not reaching for the mouse, and the panel still needs a click.

- **Realtime cross-device updates.** *Question: is the 60s reconcile
  actually annoying in practice?* `architecture.md` notes Supabase
  Realtime can drop in later with no API change. Local tick plus
  reconcile-on-focus may well be enough; adding a persistent subscription
  to find out costs the cheap hosting posture.

- **Expo app** — last by design; reuses the most.
