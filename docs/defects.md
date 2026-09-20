# Defects

Things that are broken or wrong. **A defect needs no justification** — that is
what separates this file from `roadmap.md`, where a feature has to earn its
place through the gate.

Ranked by what it costs: a wrong number or a lost record first, then a thing
that misleads, then a thing that looks wrong. A fixed defect is deleted.

**The four correctness defects that block launch live in `roadmap.md` under
M0**, because they are release-gating rather than background faults. They are
not duplicated here.

## Wrong data

- [ ] **`paid_at` records when the user clicked, not when the money arrived.**
      Nothing asks, so the timestamp is whenever they next opened
      `/invoices`. Any average built on it measures the user's habits rather
      than the client's payment behaviour.

      Ask for the date when marking paid, defaulting to today. One field on a
      control that already exists.

- [ ] **The local database drifts behind the migrations.** `pnpm migrate`
      reads `.env.local` and reaches the hosted project; the Supabase CLI owns
      the local one. Nothing routinely applies a new migration to local except
      `pnpm dev:reset`, which rebuilds from `seed.sql` and takes the local data
      with it — so the working answer is "lose your data" and the drift
      accumulates instead. It reached four migrations behind before a 500
      surfaced it, and one had been applied by hand without being recorded, so
      the CLI's tracking disagreed with the schema in both directions.

      **Decide which tracking table is authoritative before writing the fix.**
      `scripts/migrate.mjs` takes `--url` and tracks its own
      `schema_migrations`, so the shape may be a `dev:migrate` pointed at
      `:54322` — but the CLI keeps `supabase_migrations.schema_migrations`,
      and two tables tracking one database is how this got confusing.

## Misleading

- [ ] **Stopping the timer leaves Unbilled stale for two round trips.** In
      the menu bar panel, `toggle()` discards what `stopTimer()` returns and
      waits on a full `refresh()` — `/summary`, then `/stats`, then
      `/entries`, issued serially. Return the new unbilled total from
      `POST /timer/stop` alongside the entry and the panel has the number
      from the call it already made.

      The rate chain stays server-side. Unbilled resolves
      `rate_override → project → client → user default` and rounds per
      (client, rate) bucket; a client predicting its own delta would be a
      third implementation of a chain that already must agree in two places,
      and Swift has only `Project.hourlyRate` locally.

- [ ] **Every loading state was only ever seen at localhost latency.**
      Starting and stopping is noticeably clunky in production and smooth
      locally. `useTimer`'s `start` and `stop` have no `onMutate`, so the bar
      shows the old state for the whole round trip plus the
      `invalidateEntryData()` refetch that follows; `busy` only disables the
      button. Pressing start does nothing visible for two sequential
      requests.

      The server owns timer truth, so an optimistic start is a local render a
      409 must be able to take back — never a local timer that outlives the
      server's answer. The accent marks a *running* timer, so whatever
      renders between press and confirmation must not claim green.

      `TimerModel.toggle()` in the macOS app has the same fault: it awaits
      the mutation then `await refresh()`, and `isBusy` only dims the control.
      The bar is the harder half — a pip and a clock with no room for a
      spinner.

      Force a delay of about a second, and a slow case around three, then
      walk every mutation, every listing and every screen transition.

- [ ] **Adjusting a runaway focuses the task name, not the end time.** The
      `EntryDialog` at `timer-bar.tsx:171` passes no `focus`, so it falls to
      the default `'task'` — right when editing an entry, wrong here. A
      runaway is a timer left running: the task name is the one field already
      correct, and the end time is the only reason the dialog opened.

      Copy what the existing `focus === 'project'` case solved rather than
      rediscovering it. The `noAutofocus` lint rule needs the same
      `biome-ignore` with the same reasoning, and `focus:` styles must sit
      alongside `focus-visible:` — programmatic focus is never
      `:focus-visible`, so without it the cursor is in the field with nothing
      on screen saying so.

      Worth deciding while in there: whether the time is also *selected*, not
      merely focused. The field exists to be replaced rather than edited.

- [ ] **The invoice routes return more than `api.ts` declares.**
      `POST /invoices` and `/preview` carry `entryIds` per line item, and
      `POST /invoices` returns `lineItems` + `entryCount` while the client
      type says plain `Invoice`. The ids reach only the account that owns
      those entries, so this is a contract that lies rather than a leak —
      decide whether internal entry ids are part of it or get stripped.

## Looks wrong

- [ ] **The arrival count-up runs on mount, not on page load.** `useCountUp`
      seeds `target` at `to * ARRIVAL` on every mount, so every `Money` on
      Home rolls each time it mounts — including a client-side navigation
      away and back, where the figures are the ones read a moment ago. The
      roll means "these numbers just arrived"; on a return to a screen still
      holding them, it says it of nothing.

      The `QueryClient` in `providers.tsx` already draws this line: held in
      `useState` above the router, it survives a navigation and dies on
      reload. A flag set on it at first arrival, read by `useCountUp` to
      decide whether to seed the origin or rest on `to`, needs no route
      detection and no new provider. The tween on a value that *changes* is
      untouched.

- [ ] **The running timer and the primary action are the same green in
      light.** The accent carries two meanings — the live timer and the one
      confirm action a screen exists to complete. Dark separates them for
      free: `#52FC43` on a near-black ground is luminous, so a running timer
      glows where a filled button reads as a solid rectangle. Light has no
      glow to spend, and at `accent-default` L 0.455 a green dot beside a
      green duration and a green button are the same ink at the same weight.

      `accent-subtle` sits at L 0.525 and clears 4.83 on the card. Whether
      the timer takes it, or the button drops to `accent-hover` and leaves
      `default` to the timer, is the decision. Judge it on the timer bar and
      the invoice screen together — the only two places where a running timer
      and a primary action share a screen.

- [ ] **The menu bar pip shifts with the width of the clock.** It should sit
      still: it is the one thing in the bar always in the same place.

      The obvious fix is already in and is not enough — `StintApp.swift`
      gives the text a 57pt trailing frame and `.monospacedDigit()`. So the
      movement is the status item's own width changing and the system
      re-laying out from the right edge. Diagnose before changing the number:
      a `MenuBarExtra` label sizes to its content and 57pt is a guess.

      Cheapest first: trailing-align the whole label; measure the true widest
      string in the rendered font; or pad the clock to a fixed character
      count. The last is the only one that does not depend on layout
      behaviour we do not control — and it must pad with a figure space or a
      leading zero, never by rewriting what the clock says.

      This needs a `.app` rebuild to see, not `swift build` alone.

- [ ] **The menu bar panel loses its focus between openings.** Open the
      panel, click the task field, close, reopen: the field is still focused,
      so the panel never opens in a default state.

      `@FocusState` is not the lever, and this is the finding worth keeping.
      Instrumenting `TimerPanel` logged `onAppear focused=false` while the
      field was visibly focused — the AppKit field editor holds first
      responder and the SwiftUI binding never sees it, so clearing
      `taskFocused` clears something already false.
      `NSApp.keyWindow?.makeFirstResponder(nil)` in `onDisappear` does not
      fix it either, probably because the panel is no longer key by then.

      Next: hold the panel's `NSWindow` and clear its responder before
      dismissal, or a `MenuBarExtraAccess`-style lookup of `NSApp.windows`.
      Three attempts have gone into this; it wants fresh eyes rather than a
      fourth variation.

- [ ] **Clearing the last inbox row collapses the section, then bounces it
      back open.** `exit-collapse` runs the row's track to `0fr` and `useExit`
      does not wait for it.

- [ ] **The menu bar panel reimplements `GET /entries/task-names`, and the
      two disagree about what a name is.** `distinctTasks` in
      `TimerModel.swift` dedupes on the raw string, so a user is offered both
      halves of their own typo; the RPC dedupes case-insensitively and keeps
      the most recent spelling. The panel also fetches 200 rows per poll to
      keep five, and refetches on every open.

      **Adopting the endpoint forces one decision**: `EntryRow` renders a
      duration the endpoint does not return, so the row has to become a
      name-to-restart rather than a past entry — or keep the duration and stay
      a different thing from what the web app suggests.

- [ ] **Eight sizes in the macOS app bypass the Typography roles.** They are
      literals where a role exists.
