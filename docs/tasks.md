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

      The cumulative line inherits this: it follows the goal's unit, so a
      revenue target plots nothing until this is built. `month_revenue` is
      month-total only and a line needs it per day — the same figure bucketed,
      not a second definition of revenue.

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
- [ ] **Extend the end-to-end suite.** Sign-in, sign-out and the invoice
      lifecycle are covered (`pnpm test:e2e`). The flows still verified only
      by hand: the runaway-timer choice end to end, entry editing
      round-tripping local wall-clock through UTC and the overnight case,
      responsive layout at 375px and 1280px, and the accent rule in rendered
      pixels rather than class strings.

      Add them one at a time and only where breakage would be silent —
      a suite that fails randomly gets ignored, which is worse than not
      having one.

- [ ] **Review the app for keyboard operation, then make it teach itself.**
      The audience is other contractors who write software, and for them a
      tracker that needs the mouse is a tracker they resent — the whole point
      is that logging time should cost nothing. Two halves, in order: what
      can be done from the keyboard at all, then whether anything on screen
      ever says so.

      **The second half is the one that is missing entirely.** There is no
      shortcut anywhere in the web app — `onKeyDown` appears twice, both
      Enter-in-a-field — and nothing renders a keystroke. A shortcut nobody
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

- [ ] **The calendar scrolls inside a scroller.** The day grid has its own
      `sm:max-h-[62vh] sm:overflow-y-auto` (`calendar.tsx:216`), and the frame
      already makes the content panel `xl:overflow-y-auto`
      (`(app)/layout.tsx:67`), with a third `overflow-y-auto` on the column
      above it at line 63. So the calendar renders two scroll wheels — an
      inner one for the hours and an outer one for the card holding it — and
      a wheel gesture over the grid moves whichever the pointer happens to be
      inside.

      **`62vh` is the specific fault.** It is viewport-relative inside a
      container whose height is already bounded by the frame, so the two
      cannot agree by construction: the frame decides how tall the panel is,
      and the calendar then asks for a fraction of the *window*. At
      `2xl` the frame is a fixed card (`max-h-[900px]`), which is where the
      disagreement is widest.

      The inner scroller does earn its place — the comment at that line says
      why, and it is right: one container keeps the hour gutter locked to the
      grid, and the phone case deliberately has no inner scroller so the page
      owns the single gesture. So the fix is which element bounds its height,
      not deleting the scroller. Either the calendar fills the panel the frame
      gives it (and the panel stops scrolling on that route), or it keeps its
      own scroll and is measured against its container rather than the
      viewport.

      Check the header and the day labels while in there: a grid that scrolls
      under a sticky header is the reason to own the scroll at all, and it is
      worth confirming that still holds once the height stops coming from
      `vh`.

- [ ] **The inbox carries more colour than it earns.**
      `screens/floating-frame.html` is the target: a title, a muted subtitle,
      quiet actions, and colour only on the one figure that is actually
      wrong. The rows now draw a 2px coloured left border each — danger or
      warning — plus a toned value and a toned subtitle, so a three-row inbox
      shows three coloured edges and the eye has nowhere to land first.

      The principle it fails is the accent's own: a signal that marks
      everything marks nothing. Danger should be reserved for the row that
      genuinely is one (an overdue invoice), with the rest reading as neutral
      objects that happen to need an action — which is what the spec draws.

      Keep what the tone currently encodes rather than dropping it: an overdue
      invoice is not the same as an unprojected entry, and the distinction
      should survive in the copy and in which single figure is coloured. This
      is about how much surface the colour occupies, not about whether the app
      still says which rows are worse.

- [ ] **Today in the dock shows a full entry list.** It renders `EntryList`,
      the same component the wide page uses — so each row carries the task
      name, the project, a billing badge, the time range and the duration,
      wrapping to two lines in a 286px column. `floating-frame.html` draws
      three fields: **client swatch, task name, duration.**

      That is not only less, it is the right less. Today is a glance at what
      the day has held, subordinate to the inbox by a hairline and no row
      surfaces — the spec says so explicitly. The time range and the badge
      answer questions you go to the entry list or the calendar to ask.

      Two consequences to settle rather than discover:

      - **`EntryList` stays as it is** — it is correct on the wide page. This
        is a dock row, so either a variant or a separate component, decided by
        how much the two still share once the row is three fields.
      - **The row still opens the editor.** Clicking an entry is how it gets
        corrected, and the dock is a primary route to it. The spec draws
        static rows because it is a still image, not because the behaviour
        goes away.

      The swatch is the client's colour through `useProjectColors()`, and
      internal work gets none — resolving to `null`, never a shared grey.

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

- [ ] **The entry dialog's project field is a native `<select>`.** It is the
      one project control in the web app the browser draws: system font,
      system metrics, a system checkmark, on a dark panel that is ours
      everywhere else. `ProjectPicker` is the same choice built on Radix with
      a client swatch on every row — so the app already contains the control
      this field should be, and the dialog is where the difference shows most,
      because the picker is visible in the timer bar a few pixels away.

      The comment at the top of `project-picker.tsx` is the whole argument,
      already written: *a native `select` cannot show the colour swatch, and
      the swatch is how work is recognised at a glance everywhere else.*

      **Also wanted: name the client, muted, beside the project.** Project
      names alone are ambiguous across clients — "Warehouse dashboard" says
      nothing about who is paying for it — and the picker is where that
      matters, since picking wrong bills the wrong client. `useProjectClients()`
      already returns `clientByProject` with the name and the colour, from the
      same two queries the swatch uses, so this needs no new fetch. Set the
      client in a muted role so the project stays the thing being chosen and
      the client is context, and leave internal work (`clientId === null`)
      with no client text at all rather than a placeholder — the absent client
      IS the meaning, the same reason its swatch resolves to `null` instead of
      a shared grey.

      Do this by making `ProjectPicker` serve both places rather than
      theming a `select` or writing a second menu. The trigger differs — a
      tag in the bar, a full-width field in the dialog — so that is a
      variant, and the row content (swatch, name, client) is written once.

      Two behaviours the dialog's field has that must survive: `autoFocus`
      when the inbox opens it on an unprojected entry, and the `focus:` styling
      that exists because programmatic focus is never `:focus-visible` — the
      comments there say why, and both are easy to lose in a port.

      **Then the other native selects, which are not all alike.** There are
      seven in the app and they split by whether the control has anything to
      say beyond the words:

      - **`project-dialog`'s Client, and `invoice-new`'s Client.** Same case
        as above, one level up: clients are the thing that HAS a colour, so
        both want the swatch. `project-dialog`'s also carries
        `+ Add a client…` as a trailing `<option>` — an action disguised as a
        choice, which is precisely what `ProjectPicker` already does properly
        with a separator and a real item. A client picker built once serves
        both, the same way the project one serves the bar and the dialog.
      - **`invoice-new`'s Group lines.** Each mode has a `hint`, and it
        currently renders outside the control — so the explanation of an
        option is only readable once you have already chosen it. A menu row
        can carry the hint under the label, which is the whole reason to
        convert this one.
      - **Theme, goal unit, account type, fee allocation.** Two to four fixed
        strings, no colour, no hint, no action. Nothing is *gained* here
        beyond matching — but matching is the point: a native select is the
        only control in the app the OS draws, and four of them scattered
        through settings and the payment dialog is the inconsistency
        arriving somewhere else. Convert them last, and only once a
        `Select` primitive exists that makes each one a few lines.

      So this is one job in two halves: the pickers that carry data the
      browser cannot render, then the plain ones for consistency. Shared
      `inputClass` styling across most of them means the trigger can keep
      looking exactly as it does — what changes is the popped-open list.

      **Check `components.html` first**, which is what a screen is assembled
      from: a select is a shape that now repeats seven times, so the
      primitive belongs there rather than being invented per-dialog, and
      shadcn has one (`pnpm dlx shadcn@latest add select`, then
      `shadcn-detox.mjs` — never hand-edited).

- [ ] **The menu bar app's two dropdowns are system-drawn.** The project
      picker and the account gear are SwiftUI `Menu`s, so their labels carry
      our tokens and type while the list that pops open is AppKit's — system
      font, system colours, system metrics, beside a panel that is ours to
      the pixel. The web's equivalents (`project-picker.tsx`,
      `account-menu.tsx`) are the same two controls built on Radix and themed,
      which is what makes the gap visible.

      **The `.transient` argument that used to sit here was wrong and has
      been removed from `menubar.html`.** It described an `NSPopover`; the app
      is a `MenuBarExtra` in `.menuBarExtraStyle(.window)` and always has
      been, and the two system `Menu`s open today without dismissing the
      panel. So there is no known failure mode to inherit — but a hand-built
      popup still has to earn what AppKit gives free, and a picker that
      dismisses the panel when opened is worse than one with the wrong font.
      Verify against the real configuration before building either way.

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

- [ ] **Effective hourly rate — not on Home, and not in the first cut.**
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

      **Snooze belongs to this row and rows like it**, and the distinction is
      not a matter of taste: every other inbox row names something the user can
      resolve themselves — assign the project, fix the runaway entry, send the
      draft — and hiding one of those is hiding a problem from the person who
      can fix it. Whether a client has paid is outside their control entirely.
      They can only go and look, and a row asking them to look every day is a
      reminder rather than an unattended mess. A snooze on the other rows
      would be the reflexive dismissal `principles.md` warns about.

- [ ] **Days-to-payment, once there is history.** `sent_at` to `paid_at`,
      trailing, per client. "Northwind pays in 12 days" is unknowable from
      memory and turns the awaiting-payment line from a fact into a forecast —
      *$1,905 out, typically back by the 28th* — which is cash-flow
      information rather than decoration.

      **Blocked on the task above**, and on real paid invoices existing:
      `seed.sql` has none, so this cannot be rendered against seeded data.
      Needs a stated minimum sample before it speaks — one invoice is not an
      average — and it says nothing rather than guessing below it.

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

## Needs a decision first

Each of these names the question blocking it. Answer the question, then it
moves up — do not start one by guessing the answer.

- [ ] **The quarter as a first-class period.** *Question: does the app report
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
      other reason this is a decision and not a Ready task.

- [ ] **Week-over-week deltas.** *Question: what threshold makes it fire
      rarely enough to be worth reading?* On lumpy contract work a 40% drop
      usually means a client's sprint ended, and a delta that is noise most
      weeks trains you to ignore the one week it is real. Compared against a
      **4-week median** and suppressed below a threshold it could mean
      something — but the threshold is empirical and needs real data. If it
      ships it is a line inside Velocity, not a card — that is where a
      month-over-month reading now lives.

- [ ] **Time-of-day heatmap.** *Question: does the billable/unbillable split
      actually vary by hour enough to see, on a real dataset?* Plain volume by
      hour is interesting and changes nothing — the calendar week already
      shows that shape. Crossed with billability it might yield "your
      unbillable time clusters between 9 and 11am", which is actionable. If
      admin turns out to be scattered evenly through the day, the card has
      nothing to say and should not ship. Check before building.

- [ ] **Task name suggestions in the menu bar panel.** *Question: does a
      second way to reuse a name earn its height beside the restart list?*
      The web half ships — `GET /entries/task-names` is live and every client
      inherits it. But `EntryRow` already restarts a prior entry in one click,
      keyboard-free, which is the panel's whole premise, and a 320pt panel
      has no room for two mechanisms doing one job. The panel is drawn and
      badged **Not built** in `docs/design/screens/task-suggest.html`, which
      is what the work would start from. `menubar.html:791-803` needs an
      endpoint row before it lands.

- [ ] **Realtime cross-device updates.** *Question: is the 60s reconcile
      actually annoying in practice?* `architecture.md` notes Supabase
      Realtime can drop in later with no API change. Local tick plus
      reconcile-on-focus may well be enough; adding a persistent subscription
      to find out costs the cheap hosting posture.

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

- [ ] **Calendar: a block can overlap the day's label.** Visible on Saturday
      in the seeded week — "Untitled" is clipped by the block above it.
- [ ] **Calendar header weight mismatch.** `type-title` at 24px/600 sits next
      to a mono readout and the pairing reads unbalanced.
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
- **macOS: signing and notarisation.** `bundle.sh` self-signs with a local
  identity, which is fine to run yourself and not something anyone else can
  open without right-clicking past Gatekeeper.
- **macOS: a global hotkey to start and stop.** The reason to have a menu bar
  app at all is not reaching for the mouse, and the panel still needs a click.
- **Expo app** — last by design; reuses the most.
- **Runaway timer push notifications** — needs APNs/FCM, so effectively gated
  behind the native apps.
