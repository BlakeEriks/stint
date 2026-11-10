# Positioning

Who this is for, what it competes against, and what it charges. **Every other
doc defers to this one.** Where a claim here and a claim elsewhere disagree,
this one wins and the other is wrong.

## The user

A US contractor who bills by the hour, works alone, and invoices their own
clients. Not an agency, not a team lead, not a freelancer on a platform that
already invoices for them.

**US first.** USD, US date and number formats, ACH routing and account numbers,
1099 and W-9 framing, and no tax line by default (`tax_rate` is 0). Other
countries are additive, never the baseline, and never inferred from sample
data or a developer's location.

They are not price-shopping. **Price is not why they arrive; it is why they distrust
what they have.** A bill that moved, a rate that went behind a paywall, a tier
that appeared. What they want is the number on the invoice to be right, and a
tool that still costs what it costs next year.

## The one line

**Built for one person, free, and the invoice is always right.**

## Three advantages, all structural

Structural means a competitor cannot copy it without giving something up.

**The money view is priced for a team, so one person pays team prices to see
it.** Toggl puts billable rates behind $9/seat, so its free user tracks time
and cannot see money. Clockify moved the same thing out of its free tier in
2026. Everhour sells a five-seat minimum, so a solo cannot buy it at all.
Harvest meters projects, clients, invoices and the dollar amount invoiced —
the bill grows when the month goes well.

**The invoice is the product; the timer is the input.** Time tracking is a
commodity given away free by Toggl, Clockify, Zoho, Paymo, and Harvest. The
numbered, rate-frozen, ACH-bearing PDF is the part that is hard and the part
worth money. What it offers is that its numbers are right, which is why the
trust rules in the constitution (`.specify/memory/constitution.md`) are the
product rather than engineering taste.

**Nothing goes behind a paywall later.** Whatever Stint charges once it has
users comes with no seats, no usage metering, and no tier that unlocks a
number you already earned. This is a promise the
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

**Free, with open sign-up, until Stint has real usage.** Anyone can create an
account. There is no paid plan, no invite list, and no card. Tracking, the
money view, the exports and the invoice PDF are all included. What to charge
is decided once there are users to ask, and this section changes first.

**Free costs Apple's fee.** The overhead is the Apple Developer Program's $99
a year, which signs and notarizes the macOS app and publishes the iPhone app;
hosting is $0 on Vercel Hobby and Supabase Free. Charging anything moves both
to Pro, since Hobby forbids commercial use, and the overhead to $654 a year.
Google Play's $25 is paid once, and push and app builds stay on free tiers.
One more user costs about nothing until roughly a thousand accounts. A design
that adds a fixed cost changes this section first.

## Scope

**There is no team, so there is nothing to build for one.**

**The app sends no mail.** We render the PDF and the user sends it from their
own address, where their domain's reputation gets it delivered and their Sent
folder keeps a copy. Competitors email invoices, so expect the comparison.

## What this is a bet on

That hourly contractors would run their day on a free tracker whose invoice is
correct. Usage comes first; what anyone would pay is the question after it.

**This is inference from the market, not from customers.** It is well
supported by what the incumbents did in 2026 — three of them moved money
features behind paywalls or usage fees — but no Stint user has been asked.
Twenty conversations with full-time hourly contractors would turn this from a
reasoned bet into a validated one, and nothing here should outrank what those
conversations say.
