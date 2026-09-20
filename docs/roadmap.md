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

---

## M0 · Correctness

Security and money integrity. Nothing ships over these.

- [ ] **A write accepts another user's `project_id`.** `POST /timer/start`
      with a project belonging to a different account returns 201 and stores
      the reference. RLS protects every read, so the entry renders with no
      project name, but the row is wrong in the database.

      The fix belongs in the database, not each route — a check that the
      referenced project's `user_id` matches — because `/timer/start`,
      `PATCH /timer` and `PATCH /entries/:id` all write the column, a
      route-level check would need repeating in three places, and it would be
      a race besides. `rls.test.ts` is where the assertion goes.

- [ ] **`allocate_invoice_number` has no explicit grant.** Invoice numbering
      is the one sequence that must be gapless under concurrency; it runs
      today on default privileges.

- [ ] **No test covers the bearer-token auth path.** It shipped broken —
      `getClaims()` needs the token passed explicitly — and nothing caught it
      because route tests inject `__TEST_DB__` and never take that path. The
      macOS app already depends on it.

- [ ] **`POST /invoices` and `/preview` leak `entryIds` per line item**, and
      `POST /invoices` returns `lineItems` + `entryCount` while `api.ts`
      declares plain `Invoice`. Decide whether internal entry ids are part of
      the contract or get stripped.

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

## M2 · Trust the tool with your records

- [ ] **CSV export of entries and invoices.**

      *Whose problem:* a contractor evaluating an unknown vendor for billing
      asks whether they can get their data out before committing years of
      records. IRS retention runs three to seven years.

      *Without it:* they do not sign up. Having no export makes us look like
      the lock-in we are positioning against.

      Invoices with issue date, paid date, client and total is the
      accountant's version and is probably the highest value per line of code
      in the file. Rates must be in the entry export, and `0` is a real rate.

## M3 · Money truth on Home

- [ ] **Re-noun the month card to unbilled, keep the projection on earned.**

      *Whose problem:* the number a contractor cannot get anywhere else is
      what they have worked and not yet billed. Earned is a commodity figure
      every competitor computes.

      *Without it:* the daily screen sells nothing. Home is the habit that
      keeps a monthly subscription alive, so it has to show the thing the
      subscription is for.

      Headline is **unbilled** — a balance that climbs while you work and
      resets when you invoice. The projection stays and projects **earned
      month-to-date extrapolated to month-end**, which is monotonic and so
      can be extrapolated; unbilled cannot, since projecting it forecasts
      when you next invoice and predicts a drop to zero. Earned buckets by
      when the work was done.

      **Awaiting** is one quiet line, rendered only when non-zero.
      **Collected** lives on `/invoices`. Today and This week are unchanged.

## M4 · Price and page

- [ ] **The download paywall.** Tracking is free and complete; downloading an
      invoice requires the paid tier. Preview stays free — it is a view of
      the user's own data and carries no invoice number, no frozen rates and
      no payment details.

- [ ] **Name the price on the landing page.** $15/month, $120/year. The page
      currently says "a few dollars a month", and a vague price reads as an
      undecided product.

- [ ] **The landing page claims platforms that do not exist.** Section 04
      implies shipped macOS and mobile apps. Write it in the future tense or
      cut it: a page that lies about platform support is a trust failure on
      the axis the whole product defends.

---

## After launch

Wanted, thought through, and deliberately not before launch. Each still owes
the gate its four answers when it moves up.

- **Recurring invoices.** Retainer clients invoice the same amount monthly.
  Zoho does this free. Not a signup blocker; a month-three one.

- **Import from Toggl and Harvest.** A file upload, not an API integration.
  Four hard parts, each already decided: overlapping entries violate the
  timer invariant and get a review step rather than silent adjustment; rates
  are not in the export and must never be back-computed from amount ÷
  duration; a stable UUIDv7 per source entry makes a re-run idempotent; and
  timestamps parse to an absolute instant, never fixed-millisecond
  arithmetic.

  Tempting earlier because the market window is open — Harvest, Clockify,
  Bonsai and FreshBooks users are all looking — but it serves people who have
  not chosen us yet, where M1 serves people who want to pay now.

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

- **Calendar proposals.** Blocked on a Google Cloud project and a verified
  OAuth consent screen. Proposed blocks are drawn, never written: a proposal
  is not a time entry, never reaches an invoice, and confirming one opens the
  timer bar pre-filled rather than inserting a row. Never guess the client.

- **macOS global hotkey**, and the menu bar app's system-drawn dropdowns.

- **Expo app.** Last by design; reuses the most.
