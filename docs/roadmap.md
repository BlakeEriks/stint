# Roadmap

Work that is wanted and not yet built, ordered by the milestone it belongs
to. **Known faults go in `defects.md` instead** — a bug needs no
justification, a feature does.

A finished item is **deleted**, not ticked. So is one decided against: there
is no archive of rejections, because the thesis moves and a past no does not
bind a new proposal. Re-argue it against `positioning.md`.

## Two lines, not one

**Alpha** is a handful of friends using it for real, on the web and on
macOS. The bar is that someone who is not us can reach it, arrive with the
history they already have, and leave with it — so M2 and M3 are both alpha,
and nothing about money is. Alpha has no price, which also defers every
question that depends on one.

**Launch** is a stranger paying. That is M4, and it is the only milestone
past the alpha line.

The distinction decides what "blocks" means in question 4 below. An item that
blocks launch and not alpha is not urgent; an item that blocks alpha is, even
when it is not product work at all.

## The gate

Nothing enters this file without answering four questions in five lines or
fewer. No answer, no entry.

1. **Whose problem is it?** A situation a contractor is in, not a capability
   we could have. *"Someone billing a flat-fee project cannot produce a
   correct invoice"* is a problem; *"we should support flat fees"* is not.
2. **What happens without it?** One of: they do not sign up, they leave in
   month three, or it annoys them. **Annoyance does not make the roadmap.**
3. **Does it serve the one person, or a team we do not have?**
4. **Which milestone, and does it block alpha or launch?**

If an earlier version of the idea was turned down, say what changed. The
thesis moved in September 2026.

**A release-gating defect is exempt**, and it is the only exemption: it sits
here rather than in `defects.md` because it blocks a milestone, and a defect
needs no justification. Every other item answers the four questions —
including the ones that feel too obvious to argue, because an item that skips
the gate teaches the next reader that the gate is optional.

---

## M2 · Someone else can open it

**Nothing here is product work**, which is why it was missing: the roadmap
gates features, and this milestone is the ground a feature stands on. A
friend who cannot receive a sign-in link, or whose Mac refuses the app, has
no opinion to give us.

Three purchases and their consequences — a domain, an SMTP provider, an Apple
developer account. `runstint.com` is registered; the other two are not. Buy
them together, because each one blocks work that looks unrelated to it.

- [ ] **Point `runstint.com` at the deployment.**

      *Whose problem:* ours, and it blocks everyone else's. The domain is
      registered — `deploying.md`, `isAppHost()` and
      `.claude/rules/routing.md` name it, and none of it resolves yet.

      *Without it:* there is nothing to send a friend. A `*.vercel.app` URL
      on a private project is fronted by SSO, so an unauthenticated visitor
      gets redirected to Vercel rather than to the app.

      *One person:* it is the precondition for anyone at all.

      Both hostnames onto the Vercel project, and the app host added to
      Supabase's **Site URL** and **Redirect URLs** — `setup.md` §4 has the
      shape, and a magic link that redirects to an unlisted origin fails
      after the click rather than before it.

      DNS is on Cloudflare, which the registrar requires. **Vercel's records
      are proxied off — grey cloud, DNS only** — because an orange-clouded
      record terminates TLS at Cloudflare and Vercel's certificate issuance
      never completes.

- [ ] **Get a trademark read on `STINT` before the name gets expensive.**

      *Whose problem:* ours, and it is the only item here that can invalidate
      the other two. **Serial 50073296** — the word STINT in standard
      characters, classes 009, 035 and 042 — was filed intent-to-use on
      26 August 2026 by Stint Workforce, LLC. Class 042 is ours, and their
      goods name *temporary work assignments*, which is close to a product
      for contractors. **STYNT** (reg. 87539615, classes 035 and 042) is a
      phonetic twin that already registered. The UK staffing app's three US
      filings are all abandoned and block nothing.

      *Without it:* nothing breaks today. Intent-to-use means they are not
      using the mark yet and the application has not been examined — it can
      still be refused or abandoned. But if it registers, its priority date
      precedes any we could establish.

      *One person:* no, and that is why it sits above the other purchases
      rather than beside them. An hour with an attorney costs less than an
      Apple developer account, and it is the last moment a rename is cheap:
      a signed binary and a domain in a client's inbox are what make the
      name expensive to change.

      A domain is $10 and reversible. **The Apple account, the signed app
      and the first invoice a client receives are not** — so this resolves
      before those, not after.

- [ ] **Custom SMTP, so sign-in links arrive.**

      *Whose problem:* every alpha user, at the only moment that matters —
      their first. Supabase's default sender is **rate-limited to a few
      messages an hour** and shared across projects, so it is adequate for
      one developer and not for five friends signing in on the same evening.
      Mail from a shared sender also lands in spam more often, and a sign-in
      link in spam reads as a broken product.

      *Without it:* they do not sign up, in the most literal sense available.

      *One person:* yes — the app sends nothing else. **Invoices still go
      from the user's own address** (`principles.md`), so this carries
      authentication mail only and nothing about it argues for sending
      invoices later.

      A provider, SPF and DKIM on the domain above, then the magic-link
      template `setup.md` §4a is already written against — which also gives
      the macOS app its six-digit code and retires `signin.sh`. One
      unresolved question: which sender address, since it appears in every
      inbox we ever reach.

- [ ] **Sign the macOS app, so it opens on someone else's Mac.**

      *Whose problem:* every alpha user on macOS. `bundle.sh` self-signs with
      a local identity, which is fine to run yourself and **not something
      anyone else can open without right-clicking past Gatekeeper**
      (`docs/macos.md`). A friend who has to be talked through a security
      warning has already learned the wrong thing about a billing app.

      *Without it:* they do not use the menu bar app, which is the daily
      habit the whole subscription rests on (`principles.md`).

      *One person:* yes, and it is the gate on several later things — a
      Developer ID also earns `TokenStore` a `teamid:` Keychain partition and
      is what Sign in with Apple waits on.

      A paid Apple developer account, then notarisation. The same purchase
      unblocks both.

- [ ] **Version the macOS app, and tag `0.1.0` at alpha.**

      *Whose problem:* ours, the first time a friend reports something from a
      build three weeks old. Nothing carries a version today — the root
      `package.json` has none and the bundle has no `CFBundleShortVersionString`
      — which is correct while the only copy is ours and a commit SHA
      identifies it.

      *Without it:* a support question has no answer. The web app cannot
      drift, because everyone gets the current deploy; **a native app on
      someone else's machine is the first thing that can.**

      *One person:* it starts mattering the moment the app leaves this
      machine, which is what makes it M2 rather than earlier.

      The version belongs in the bundle and readable from the app, so a
      report names it without the user finding it.

- [ ] **Alpha is invite-only, and the landing page is how you ask.**

      *Whose problem:* ours, and it is live the moment the apex resolves.
      Magic-link auth **creates the account on first sign-in** — there is no
      allowlist anywhere in the tree — so today every CTA on the landing page
      is an open front door into the production database.

      *Without it:* a stranger we did not invite has a real account, and the
      first limit we hit is Supabase's default sender, which is the same
      few-an-hour cap the SMTP item above exists to lift.

      *One person:* yes, and it is what makes the page publishable before
      any of that is finished.

      **Capture an address instead of signing them in.** A form service, not
      a table and a route: an unauthenticated write endpoint on our own
      database needs rate limiting to not become a spam target, and that is
      more work than an alpha list of a dozen people justifies. The gate is
      us reading the list, which is what invite-only means at this size.

      Swap it for a real table when there is a reason — a volume that makes
      reading the list tedious, not a preference for owning the rows.

- [ ] **An address on the domain: `hello@runstint.com`.**

      *Whose problem:* every alpha user who wants to reply to something, and
      ours on the invoice — a billing tool whose only contact is a personal
      Gmail undercuts the thing it is selling.

      *Without it:* it annoys them, which does not make the roadmap on its
      own — **but the capture form and the invoice footer both need an
      address to name**, and neither can ship without one.

      *One person:* yes.

      Cloudflare Email Routing forwards it, free and in minutes. **It does
      not send**, so it replaces nothing in the SMTP item above: that is
      still a separate provider, and this is only an inbox.

- [ ] **Sign in as a stranger would.** A second machine, an address that has
      never touched this project, and no local anything — through the real
      domain, the real sender, the real redirect. Every failure above
      happens after a click and none of them show up in CI.

## M3 · Your records get in, and back out

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

## M4 · Taking money

**Past the alpha line.** Friends are not a pricing experiment, so nothing
here blocks them trying it — but nothing else turns this into a business.

**This milestone is a subsystem, not a copy change**, and it is the largest
thing left. Nothing here exists in the codebase today: there is no Stripe
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

  **Shades reach the week's bars and the month's client strip, never the
  heatmap.** Those two spend no lightness, so the channel is free. The heatmap spends it on
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

- **Sign in with Apple on macOS.** `signInWithIdToken` would replace the
  emailed six-digit code. It needs the Developer ID that M2 buys, plus an App
  ID with the capability and a signed bundle — a SwiftPM executable produces
  none of that. Nothing in the API changes. Deferred because the code works.

- **Expo app.** Last by design; reuses the most.
