# Positioning

Who this is for, what it competes against, and what it charges. **Every other
doc defers to this one.** Where a claim here and a claim elsewhere disagree,
this one wins and the other is wrong.

## The user

A US contractor who bills by the hour, works alone, and invoices their own
clients. Not an agency, not a team lead, not a freelancer on a platform that
already invoices for them.

They are not price-shopping — at $100k+ a year, $40 is what a billable
minute costs them. **Price is not why they arrive; it is why they distrust
what they have.** A bill that moved, a rate that went behind a paywall, a tier
that appeared. What they want is the number on the invoice to be right, and a
tool that still costs what it costs next year.

## The one line

**Built for one person, priced like it, and the invoice is always right.**

## Three advantages, all structural

Structural means a competitor cannot copy it without giving something up.

**The money view is priced for a team, so one person pays team prices to see
it.** Toggl puts billable rates behind $9/seat, so its free user tracks time
and cannot see money. Clockify moved the same thing out of its free tier in
2026. Everhour sells a five-seat minimum, so a solo cannot buy it at all.
Harvest meters projects, clients, invoices and the dollar amount invoiced —
the bill grows when the month goes well.

**This is a bet on their behaviour, not a law.** Any of them could ship a
solo plan tomorrow and cannibalise nothing, because a one-person account pays
them nothing today. What is true is that none of them has, and 2026 moved
them the other way. Where they have a solo path it is a funnel rather than a
product: Harvest's free tier is two projects, Zoho's is three.

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
and has more features than we do, so the answer is never a longer feature
list. Two things are true instead: its timer is an adjunct to Books and
Projects rather than a tracker someone runs all day, and its free tier caps
three projects — a wall a working contractor hits in a quarter. We are the
tracker that produces the invoice, not an invoicer with a timer attached.

## Price

**$40 a year — $3.33 a month, billed annually.** There is no monthly option.

Time tracking is free and complete: unlimited clients, projects, entries and
history, kept as long as the user needs it, with the money view and the
exports included. **Downloading an invoice requires the paid tier**, and that
is the only thing that does — the records get out free, the document is the
product.

**The price is set to cover the bill, not to return a margin.** Vercel Pro and
Supabase Pro are $45 a month between them — Vercel's free tier forbids
commercial use and Supabase's pauses after a week idle, so both are forced the
moment money changes hands. That is **$555 a year, and it is the whole
overhead**. At $40 a year, net of Stripe's 4.4% on a single annual charge,
**fifteen subscribers cover it.**

**Serving one more user costs approximately nothing.** Supabase Pro includes
8GB and 250GB of egress against a few megabytes of rows per user-year, so the
bill stays flat to somewhere near a thousand accounts. Nobody has to be
converted for this to work, which is why the free tier can afford to be whole.

**Annual-only is deliberate.** A third of churn under $10 is involuntary —
dead cards, not decisions — and one charge a year is one chance to fail. It
also matches how a tool like this is actually judged: once, at renewal, not
every month.

## Scope

**There is no team, so there is nothing to build for one.**

**The app sends no mail** — we render the PDF and the user sends it from their
own address. Competitors email invoices, so expect the comparison;
`design/principles.md` has the reasoning.

## What this is a bet on

That fifteen contractors will pay $40 a year for an invoice that is correct,
when the tracking around it is free.

Fifteen is the whole bar, and it is what makes this survivable: the product
does not need to convert a market, only to cover a hosting bill.

**This is inference from the market, not from customers.** It is well
supported by what the incumbents did in 2026 — three of them moved money
features behind paywalls or usage fees — but no Stint user has been asked.
Twenty conversations with full-time hourly contractors would turn this from a
reasoned bet into a validated one, and nothing here should outrank what those
conversations say.
