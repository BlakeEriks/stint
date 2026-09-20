# Positioning

Who this is for, what it competes against, and what it charges. **Every other
doc defers to this one.** Where a claim here and a claim elsewhere disagree,
this one wins and the other is wrong.

## The user

A US contractor who bills by the hour, works alone, and invoices their own
clients. Not an agency, not a team lead, not a freelancer on a platform that
already invoices for them.

They are not price-shopping. They are billing $100k+ a year and want the
number on the invoice to be right.

## The one line

**Built for one person, priced like it, and the invoice is always right.**

## Three advantages, all structural

Structural means a competitor cannot copy it without giving something up.
Feature lists are not advantages; these are.

**Every competitor is paid per seat, which makes them hostile to one person.**
Toggl puts billable rates behind $9/seat, so its free user tracks time but
cannot see money. Everhour sells a five-seat minimum, so a solo cannot buy it
at all. Harvest meters projects, clients, invoices and the dollar amount
invoiced — the bill grows when the month goes well. None of them can fix this
without cannibalising the team revenue that funds them. We have no team plan
to protect.

**The invoice is the product; the timer is the input.** Time tracking is a
commodity given away free by Toggl, Clockify, Zoho, Paymo and Harvest. The
numbered, rate-frozen, ACH-bearing PDF is the part that is hard and the part
worth money. We charge for the document, never for the tracking — so what the
paid tier sells is that its numbers are right, which is why the trust rules in
`design/principles.md` are the product rather than engineering taste.

**The price is knowable in advance and stays.** No seats, no usage metering,
no tier that unlocks a number you already earned. This is a promise the
incumbents cannot currently make: Harvest moved to usage fees in 2026,
Clockify moved billable rates behind a paywall in April 2026, and FreshBooks
raised prices in March 2026 with a one-cycle hold.

## The competitors that matter

| | Free tier | What it costs a solo |
| --- | --- | --- |
| **Zoho Invoice** | Genuinely free, permanently | 3 projects, 500 invoices/yr. Loss-leader for the Zoho suite. |
| **Harvest** | 1 seat, 2 projects, invoicing | Usage fees above that, rates unpublished. |
| **Toggl Track** | 3 users, unlimited tracking | Billable rates start at $9/seat — free users cannot see money. |
| **Clockify** | 5 users, unlimited tracking | Invoicing from $5.49/seat; billable rates left the free tier in 2026. |
| **Bonsai** | None | $19–25/mo for invoicing. Acquired by Zoom, being folded into Zoom Workplace. |
| **FreshBooks** | None | $23/mo entry, raised March 2026. |

**Zoho Invoice is the hardest competitor, not Harvest.** It is free forever
and has more features than we do. We do not out-feature it. We are for the
contractor who wants one tool that does two things correctly, rather than a
free door into an accounting suite.

**We do not out-feature anyone.** Feature parity with a venture-funded
incumbent is not available and not the goal.

## Price

**$15/month, or $120/year.** Annual is the default offer.

Time tracking is free and complete — unlimited clients, projects, entries and
history, no watermark, no nag, no expiry. **Downloading an invoice requires
the paid tier.**

Annual billing matters more than the headline: at $15/mo, Stripe's fixed
$0.30 is 2% of revenue, and a third of churn under $10 order value is
involuntary — dead cards, not decisions.

## What we do not build

Stated as what we are, not as a list of rejections.

**There is no team, so there is nothing to build for one.** No seats, no
approvals, no capacity planning, no client portal.

**The app sends no mail** — we render the PDF and the user sends it from their
own address. Competitors email invoices, so expect the comparison;
`design/principles.md` has the reasoning.

## What this is a bet on

That a contractor will pay $15/month for an invoice that is correct, when the
tracking around it is free.

**This is inference from the market, not from customers.** It is well
supported by what the incumbents did in 2026 — three of them moved money
features behind paywalls or usage fees — but no Stint user has been asked.
Twenty conversations with full-time hourly contractors would turn this from a
reasoned bet into a validated one, and nothing here should outrank what those
conversations say.
