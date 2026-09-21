# Roadmap

Work that is wanted and not yet built, ordered by the milestone it belongs
to. **Known faults go in `defects.md` instead** — a bug needs no
justification, a feature does.

A finished item is **deleted**, not ticked. So is one decided against: there
is no archive of rejections, because the thesis moves and a past no does not
bind a new proposal. Re-argue it against `positioning.md`.

## The gate

Nothing enters this file without answering four questions in five lines or
fewer. No answer, no entry.

1. **Whose problem is it?** A situation a contractor is in, not a capability
   we could have. *"Someone billing a flat-fee project cannot produce a
   correct invoice"* is a problem; *"we should support flat fees"* is not.
2. **What happens without it?** One of: they do not sign up, they leave in
   month three, or it annoys them. **Annoyance does not make the roadmap.**
3. **Does it serve the one person, or a team we do not have?**
4. **Which milestone, and does it block launch?**

If an earlier version of the idea was turned down, say what changed. The
thesis moved in September 2026.

**A release-gating defect is exempt**, and it is the only exemption: it sits
here rather than in `defects.md` because it blocks a milestone, and a defect
needs no justification. Every other item answers the four questions —
including the ones that feel too obvious to argue, because an item that skips
the gate teaches the next reader that the gate is optional.

---

## M1 · The invoice can represent a real business

The paid tier is the invoice. If it cannot describe the work, there is
nothing to sell.

- [ ] **Non-time line items: flat fee and rebilled expense.**

      *Whose problem:* a contractor who bills a fixed-scope project, a
      deposit, a retainer amount, or who rebills a flight or a licence, cannot
      produce a correct invoice at all today.

      *Without it:* they do not sign up. This is not a missing nicety — the
      tool cannot invoice their business.

      *One person:* yes. Flat-fee work is the common solo shape, not an
      agency one.

      `LineItem` in `packages/core/src/invoice.ts` requires `quantitySeconds`
      and `entryIds`, so every line is structurally time. This is a type
      change reaching core, the SQL rate chain, the PDF and the API — the
      largest item before launch, and the one that gates revenue.

      Expenses need no receipt capture or categories to clear this bar. A
      line on an invoice that is not hours is the whole requirement.

## M2 · Your records get in, and back out

Both directions of the same promise: the history you arrive with comes with
you, and nothing you build here is held hostage.

- [ ] **CSV export of entries and invoices.**

      *Whose problem:* a contractor evaluating an unknown vendor for billing
      asks whether they can get their data out before committing years of
      records. IRS retention runs three to seven years.

      *Without it:* they do not sign up. Having no export makes us look like
      the lock-in we are positioning against.

      *One person:* yes — one account's rows, no permissions to decide.

      Invoices with issue date, paid date, client and total is the
      accountant's version and is probably the highest value per line of code
      in the file. Rates must be in the entry export, and `0` is a real rate.

- [ ] **Import from Toggl and Harvest.**

      *Whose problem:* a contractor arriving with years of history has it
      somewhere else. Starting on an empty database means their first month
      here cannot be compared with anything, and the invoice they most want to
      check against is the one they already sent from the old tool.

      *Without it:* they do not start. Not "they leave in month three" — an
      import is the first thing they try, before any of this is worth
      evaluating.

      *One person:* yes, and the first of them is us. This is the path onto
      the product, not a migration nicety.

      A **file upload**, not an API integration: the CSV/JSON export is
      stable, needs no OAuth app or stored third-party credential, and keeps
      working if their API changes. Parsing belongs in `packages/core` as pure
      functions over parsed rows, so the preview a user reviews and the rows
      that get written come from identical code.

      Four parts are hard, and each is already decided:

      - **Overlaps violate the timer invariant.** Toggl permits overlapping
        entries and a real export contains them. Never resolve this by
        adjusting timestamps — import everything unambiguous and present the
        conflicting set as a review step. Import happens once in a lifetime,
        so a review step is cheap; a wrong hour inside a past invoice is not.
      - **Rates are not in the export, and `0` is a real rate.** The CSV
        carries an amount per entry, not the hierarchy that produced it.
        Back-computing rate from amount ÷ duration gives rounding noise and is
        wrong for anything billed flat. Imported entries resolve through the
        normal chain; those that cannot surface as unrated, the state
        invoicing already refuses to generate from. Never write a guessed
        rate.
      - **Idempotency.** A stable UUIDv7 per source entry, so re-running a
        partial or interrupted import cannot duplicate anything.
      - **Timestamps and DST.** Toggl exports wall-clock local time plus a
        separate timezone field. Parse to an absolute instant and store UTC.

      Tags are dropped — there is no tag concept here and adding one to serve
      an import imports Toggl's scope along with its data. Durations are
      derived, so the import writes `started_at`/`ended_at` and never a
      duration; where Toggl's reported duration disagrees with its own
      start/end pair, surface the disagreement rather than picking a winner.

      **Out of scope:** no live sync. Two systems of record is a different
      product.

## M3 · Money truth on Home

- [ ] **Build Home as `design/screens/home.html` specs it.**

      *Whose problem:* the screen is the daily open, and the habit is what
      keeps the subscription. `principles.md` says why Home carries it.

      *Without it:* Home stays a grid of cards that never agreed on what it
      is for.

      *One person:* yes. Every figure is one contractor's own work.

      Three regions — Today, This week, the month — in one panel. The
      headline is **earned**, which accumulates all month and settles; the
      projection extrapolates it because a monotonic series is the only kind
      that can be extrapolated. **Unbilled stays all-time** and keeps its
      place as the month's third figure: it is the balance a contractor
      cannot get anywhere else, and month-scoping it would answer a narrower
      question than the one it is there for. Awaiting becomes one quiet line,
      rendered only when non-zero. **Collected moves off Home** to
      `/invoices` — for a contractor paid monthly it freezes in week one and
      says nothing for the rest of the month.

      **The cleanup is part of this item, not a follow-up.** Six cards come
      off, and with them the `/stats` fields and SQL rollups only they read —
      `home.html`'s *What leaves when this ships* names each one, which side
      of the line it falls on, and the three fields that stay because the
      dock and `/invoices` read them. A card deleted without its field leaves
      a payload every visitor pays for and nothing renders.

- [ ] **Colour the week's bars and the month's strip by client.**

      *Whose problem:* a month is rarely one client, and the line cannot say
      who it came from. Two identical climbs, one from a single client and one
      from four, are different months to be in.

      *Without it:* the panel's one use of colour is the client, and a screen
      of neutral bars spends none of it.

      *One person:* yes — one contractor's own client mix.

      The week's stack divides each bar's SECONDS, from
      `/calendar?granularity=day`'s `byClient`, which already returns seconds
      per client per local day. The month's strip divides the month's MONEY,
      from `revenue_by_client` over the month — a rollup that already exists
      and lost its caller with Velocity. One legend at the foot names every
      hue, internal work included with its hollow ring.
      `design/screens/home.html` has the rules.

- [ ] **Remove the monthly goal.**

      *Whose problem:* nobody's, which is the point. A goal is a number the
      user invents, and a pace line, a percentage or a projected shortfall is
      arithmetic on a guess wearing the authority of a fact. It fails the gate
      in `principles.md` twice: it is not a number the user cannot compute in
      their head, and a figure that moves must be true.

      *Without it:* the screen keeps a figure that measures showing up rather
      than getting paid.

      *One person:* n/a — this is a removal.

      `monthly_target` and `monthly_target_unit` (migration `…_6_goals.sql`),
      `buildPace`/`buildPaceSeries` in `packages/core/src/stats.ts`, `pace` on
      `GET /stats`, the goal field in `settings-form.tsx` and its `Settings`
      schema entry, the pace rendering in `home-month.tsx`, and
      `settings-goal.test.tsx`. Nothing is left behind a flag: a column no
      writer fills and a builder no route calls are the same debt as the card
      itself.

      **Users who set one are told, not silently corrected.** The columns hold
      real data somebody typed, and `principles.md` says the app never
      modifies user data on their behalf. Drop the columns in a migration that
      is announced, not folded into an unrelated deploy.

- [ ] **Expose the fields Home's spec needs.**

      *Whose problem:* three figures on the specced screen have no field
      behind them.

      *Without it:* the screen cannot be built.

      *One person:* n/a — this is plumbing.

      The month's **earned** and its **cumulative series** are already
      computed: `revenue_by_day` runs over the month and reduces to the map
      `earnedToday` reads, but only `earnedToday` is returned. The
      **trailing-pace projection** replaces the goal ray `buildPace` built.
      The week's bars need **money per day**, which `GET
      /calendar?granularity=day` does not carry — it returns seconds. Widen
      the rollup; never call `resolve_entry_rate` once per day.

## M4 · Taking money

**This milestone is a subsystem, not a copy change**, and it is plausibly
larger than M1. Nothing here exists in the codebase today: there is no Stripe
integration, no subscription table, no entitlement check.

- [ ] **Billing: subscribe, and know who has.**

      *Whose problem:* nobody can pay us. Every other milestone improves a
      product that takes no money.

      *Without it:* there is no business, only a free tracker.

      *One person:* yes — one subscription, no seats, no proration, no team
      billing. The simplest shape Stripe supports.

      Checkout, a webhook that is the source of truth for subscription state,
      an entitlement the API can check, dunning for the failed cards that are
      a third of churn under $10, an upgrade screen, and a place to cancel.
      **Cancelling never locks an invoice already generated** — the user's
      records are theirs, and retroactively withholding a document they
      created while paying is the trust failure the whole product argues
      against.

      Decide before building: whether the price carries sales tax
      (`CLAUDE.md` sets a US stance for the user's invoices and says nothing
      about our own), and what `/terms` has to state once money is recurring.

- [ ] **Gate the invoice document, and gate it in the right place.**

      *Whose problem:* the paid tier has to actually be paid for.

      *Without it:* the price is decorative.

      *One person:* yes.

      **`GET /invoices/:id/pdf` is the boundary — both dispositions.** Today
      `invoice-detail.tsx` renders Download and Preview against that one
      route, differing only by `?download=1`, which the route turns into
      `attachment` or `inline`. Inline is a PDF viewer with a save button, so
      gating the query parameter gates nothing.

      **Pre-generation preview stays free**, and it is a different thing:
      `POST /invoices/preview` returns line items as JSON with no invoice
      number, no frozen rates and no payment details. It is a view of the
      user's own data, and restricting it would be bookkeeping the product
      refuses.

      **Generating** an invoice — allocating the number, freezing rates,
      locking entries — is the other open question. If it stays free, a free
      user reads the totals off the detail screen and retypes them, which
      makes the wall an inconvenience rather than a boundary. Decide
      deliberately.

      The data export in M2 is deliberately not gated: **data gets out free,
      the document is the product.** Say that on the page, because a reader
      who meets both rules will otherwise think they contradict.

---

## After launch

Wanted, thought through, and deliberately not before launch. Each still owes
the gate its four answers when it moves up.

- **Recurring invoices.** Retainer clients invoice the same amount monthly.
  Zoho does this free. Not a signup blocker; a month-three one.

- **Payment links.** Every competitor has them and they get the user paid
  faster. Also a large build — webhooks, reconciliation, payout states, KYC —
  and in tension with sending the invoice from your own address. An open
  question, not a plan.

- **`/reports` and what points at it.** Hours per project answers *is this
  fixed-price job underwater*, which is the most expensive thing to learn
  late. It needs a billed/unbilled split and is never called "earned".
  Effective hourly rate — money over all hours including unbillable — is the
  number that makes admin visibly expensive.

- **The quarter as a first-class period.** A US contractor pays estimated tax
  quarterly, so the quarter is a real unit for this user rather than a
  generic one.

- **A project takes a shade within its client's hue**, and `projects.color`
  stops being dead. One client and several projects is the common solo shape:
  that user's mix is a single flat segment and their heatmap one colour, so
  the panel spends its colour channel saying nothing.

  **This cancels the column's drop**, which `data-model.md` still points here
  for. The column was scheduled for retirement because nothing claimed a
  project has a colour; that rule is what changes, so it is revived rather
  than dropped and re-added — and re-specified as a **shade index, not a
  hex**, since a stored hex is the drift the token package exists to prevent.
  It is `text` today, so this is an `alter type` to `smallint` with a check
  constraint.

  **The eight project hues are authored, not derived** — hand-set pairs in
  `tokens.json` with no generator behind them, and `generate.js`,
  `color-picker.tsx` and three emitted formats all assume that flat shape. So
  the generator is the long pole, not the column. Every hue is `L=0.700,
  C=0.111`, differing only in angle, so a shade walks L at constant hue: four
  steps at ΔL 0.080 — `0.780/0.098`, `0.700/0.111`, `0.620/0.118`,
  `0.540/0.115` — none gamut-clipped at any of the eight angles. **Step 2 is
  the client's own hue**, so a project with no shade set renders what it
  renders today. Four is the ceiling; a fifth halves the step.

  **Shades reach the bar chart and Velocity's mix, never the heatmap.** Those
  two spend no lightness, so the channel is free. The heatmap spends it on
  hours, where shades do not blur but **invert**: composited on the panel,
  step 1 at 35% opacity lands at L 0.437 while step 4 at full opacity lands at
  L 0.540, so the lightest project on a quiet day renders darker than the
  darkest project on a busy one — the cell lying on both axes at once.

  `deriving-colour.md` owns the derivation. `CLAUDE.md`'s *only clients have a
  colour* becomes *a client owns a hue; a project may take a step on it*.

- **Calendar proposals.** Blocked on a Google Cloud project and a verified
  OAuth consent screen. Proposed blocks are drawn, never written: a proposal
  is not a time entry, never reaches an invoice, and confirming one opens the
  timer bar pre-filled rather than inserting a row. Never guess the client.

- **macOS global hotkey**, and the menu bar app's system-drawn dropdowns.

- **macOS signing, notarisation and Sign in with Apple** — one gate, which is
  a paid Apple developer account. `bundle.sh` self-signs with a local
  identity: fine to run yourself, and not something anyone else can open
  without right-clicking past Gatekeeper. A Developer ID would also earn
  `TokenStore` a `teamid:` Keychain partition, and `signInWithIdToken` would
  replace the emailed six-digit code — it needs that account, an App ID with
  the capability and a signed bundle, none of which a SwiftPM executable
  produces. Nothing in the API changes.

- **Expo app.** Last by design; reuses the most.
