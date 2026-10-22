Closes #60

# Feature Specification: Subscribe, and know who has

**Feature Branch**: `f60-billing`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Issue #60, "Billing: subscribe, and know who has": nobody can pay
us, so there is no business, only a free tracker. One subscription, no seats,
no proration, no team billing. Checkout, a webhook that is the source of
truth, an entitlement the API can check, dunning, an upgrade screen and a
place to cancel. Canceling never locks an invoice already generated. The
price is `docs/positioning.md`'s: $40 a year, billed annually, no monthly
option. Gating the invoice document is #61, not this feature.

## Design

Design review: skipped in autonomous run; follows existing Settings and
`.claude/rules/web-ui.md`.

- **Where**: a Plan section in Settings, beside the existing sections. No
  new route and no nav entry.
- **Free**: "Free" with one line on what paid adds, the price, and
  Subscribe.
- **Subscribing**: Subscribe shows a spinner until the payment page opens.
- **Confirming**: back from the payment page, the section says it is
  confirming the payment, with a spinner, until the server answers.
- **Paid**: "Paid", "Renews on {date}", and Manage billing.
- **Canceling**: "Paid until {date}" and Manage billing, which resumes.
- **Payment failed**: "Your last payment failed" with Update card, which
  opens the same hosted page.
- **Failed to open**: the control's spinner ends and the app-wide notice
  says why.
- **Not configured**: the section isn't rendered.

## Clarifications

### Session 2026-10-12

- Q: Does the $40 price collect US sales tax, and is it added or included?
  → A: No sales tax is collected at launch; the price is $40 flat. No state's
  economic-nexus threshold (typically $100,000 or 200 transactions a year)
  is in reach of the 15-subscriber bet, and the processor's free threshold
  monitoring says when one is. The open question is the operator's home
  state, where nexus is physical: about half of states tax SaaS, so the owner
  confirms their state's rule before live keys. If it taxes SaaS, tax is
  added at checkout (exclusive), never folded into the $40, so the
  advertised price stays the price. (decided autonomously)
- Q: What must `/terms` state now that the charge recurs? → A: A Billing
  clause replacing today's "Price" clause, which promises Stint stays free
  and is now wrong: the price and that it is billed yearly in advance; that
  it renews automatically until canceled; that cancel is in Settings, online,
  any time, and takes effect at the end of the paid year; that a reminder is
  emailed before each renewal; that a price change takes effect only at a
  renewal, with at least 30 days' notice; that a failed payment is retried
  and the paid tier continues meanwhile; and that canceling never takes
  away records or invoices already generated. The draft is marked in the
  page source as needing legal review. This follows the FTC's
  negative-option guidance and California's automatic-renewal law, the
  strictest state rule. (decided autonomously)
- Q: What refund does a subscriber get? → A: A full refund on request within
  30 days of any charge, first payment or renewal, which the owner issues from
  the processor's dashboard; none after. No partial refund on cancel, since
  the paid tier runs to the end of the year. A forgotten renewal is the
  usual complaint about an annual plan, and a refund window answers it
  without building anything. (decided autonomously)
- Q: Where does the upgrade screen live? → A: A Plan section in Settings,
  not its own route. One subscription with one price needs no comparison
  page, and Settings is where a user already looks for their account.
  (decided autonomously)
- Q: How long is a failed renewal retried before the subscription ends? →
  A: The processor's recommended Smart Retries, up to 8 attempts over 2
  weeks, with its failed-payment emails on; after the last failure the
  subscription is canceled. The user stays paid throughout. (decided
  autonomously)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subscribe (Priority: P1)

A contractor who has tracked a month of work decides the invoice is worth
$40 a year. In Settings they see what they're on, what the paid tier costs
and what it includes, press Subscribe, pay on a hosted checkout page, and
come back to Settings showing they're subscribed and when it renews.

**Why this priority**: Without it nobody can pay, and the product has no
revenue.

**Independent Test**: In test mode, subscribe from Settings with a test card
and confirm Settings and the API both report the paid plan with its renewal
date.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no subscription, **When** they open
   Settings, **Then** they see they're on the free plan, the price as
   positioning states it, and a Subscribe control.
2. **Given** that user, **When** they press Subscribe, **Then** the control
   shows a pending state and they land on a hosted payment page that states
   the price, that it renews yearly until canceled, and links the terms.
3. **Given** a completed payment, **When** they return to Settings, **Then**
   it shows the paid plan and its renewal date, confirming within seconds
   and showing a pending state until it does.
4. **Given** a user who abandons the payment page, **When** they return,
   **Then** they're still on the free plan and nothing was charged.
5. **Given** a subscribed user, **When** anything tries to start a second
   subscription for them, **Then** it is refused.

---

### User Story 2 - Know who has paid (Priority: P1)

Every part of the app that will need to know whether a user has paid asks
the server one question and gets one answer, which follows the payment
processor's record of the subscription and never a client's claim.

**Why this priority**: The paid tier means nothing unless the server can
tell who is on it. #61 gates the invoice document on this answer.

**Independent Test**: Deliver each subscription change from the processor
(created, renewed, payment failed, canceled) and confirm the answer the API
gives follows each one, including a change delivered twice or out of order.

**Acceptance Scenarios**:

1. **Given** a subscription change at the processor, **When** it is
   notified, **Then** the user's plan reflects the processor's current
   record, not the order the notifications arrived in.
2. **Given** the same notification delivered twice, **When** both are
   processed, **Then** the result is the same as processing it once.
3. **Given** a notification whose signature doesn't verify, **When** it
   arrives, **Then** it is rejected and nothing changes.
4. **Given** a user, **When** they or any client ask for their plan,
   **Then** they get only their own, and no user can set it themselves.

---

### User Story 3 - Cancel, and update a card (Priority: P2)

A subscriber who no longer needs Stint cancels from Settings. They keep the
paid tier until the end of the year they paid for, then return to free with
every record and every invoice they made still theirs. A subscriber whose
card expired updates it from the same place.

**Why this priority**: A subscription people can't leave or fix is a trust
failure, and the law requires an easy cancel for an auto-renewing charge.

**Independent Test**: In test mode, cancel from Settings and confirm the
plan shows when it ends, stays paid until then and becomes free after, with
every invoice still listed and viewable.

**Acceptance Scenarios**:

1. **Given** a subscriber, **When** they choose to manage billing, **Then**
   they reach a hosted page where they can cancel, update their card and see
   past receipts.
2. **Given** a subscriber who canceled, **When** they return to Settings,
   **Then** it says the paid tier ends on a date and offers to resume.
3. **Given** a canceled subscription past its end, **When** the user opens
   the app, **Then** they're on the free plan and every invoice they
   generated is still theirs: listed, viewable, and downloadable if it was
   generated while they were paying.
4. **Given** a subscriber who deletes their account, **When** the account is
   deleted, **Then** the subscription is canceled at once and they're never
   charged again.

---

### User Story 4 - A failed card doesn't silently end a subscription (Priority: P2)

A subscriber's renewal fails because the card expired. The processor
retries over the following weeks and emails them; Settings says the payment
failed and offers to update the card. They keep the paid tier while it is
retried. If every retry fails the subscription ends and they're on free.

**Why this priority**: Failed cards are about a third of churn at this
price. Recovering them is cheap revenue, and losing access without warning
is the trust failure the product argues against.

**Independent Test**: In test mode, fail a renewal and confirm Settings
shows the failure with a way to fix it, the user stays paid during retries,
and the plan becomes free when retries are exhausted.

**Acceptance Scenarios**:

1. **Given** a failed renewal, **When** the user opens Settings, **Then** it
   says the payment failed and offers to update the card.
2. **Given** a payment being retried, **When** anything asks the user's
   plan, **Then** they are still paid.
3. **Given** every retry failed, **When** the processor ends the
   subscription, **Then** the user is on the free plan.

---

### Edge Cases

- Payment completes but the processor's notification is late: returning to
  Settings confirms the subscription by asking the processor directly, so
  the user isn't shown the free plan after paying.
- Two Subscribe presses, or two tabs: one customer per user, and Subscribe
  is refused once the user is paid. Two payment pages completed in the same
  moment would make two subscriptions; the server keeps the paid one and
  reports the duplicate for the owner to refund.
- Billing not configured (no processor keys in the environment, as on every
  deploy until the owner sets it up): the plan section doesn't show, and the
  rest of the app is unaffected.
- The processor is down when Subscribe is pressed: the control's pending
  state ends and the app says why; nothing is recorded.
- A notification for a customer this app doesn't know: acknowledged and
  ignored, so the processor stops retrying it.
- A refund issued from the processor's dashboard: the plan follows whatever
  state the processor reports for the subscription.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The paid tier MUST be one yearly subscription at the price
  `docs/positioning.md` states, with no seats, quantities, proration,
  monthly option or team billing.
- **FR-002**: A signed-in user MUST be able to start a subscription from
  Settings and pay on a page hosted by the payment processor. The app never
  sees or stores card details.
- **FR-003**: The payment page MUST state the price, that it renews yearly
  until canceled, and link the terms, before the user pays.
- **FR-004**: The processor's notifications MUST be the source of truth for
  subscription state. Each MUST be signature-verified, and processing MUST
  be idempotent and independent of arrival order.
- **FR-005**: The server MUST expose the user's plan through the shared API
  (Constitution III): free or paid, the subscription's status, when it renews
  or ends, whether it's set to cancel, and whether a payment has failed.
- **FR-006**: A user MUST count as paid while their subscription is active,
  set to cancel but not yet ended, or past due and being retried. Every
  other state is free.
- **FR-007**: No user MUST be able to write their own or anyone's plan, and
  no user MUST be able to read anyone else's.
- **FR-008**: A subscriber MUST be able to cancel, resume, update their card
  and see receipts from a page the processor hosts, reached from Settings.
- **FR-009**: A canceled subscription MUST keep the paid tier until the end
  of the paid period. Canceling MUST NOT delete, hide or lock any record or
  any invoice already generated (#61 enforces this at the document).
- **FR-010**: A failed renewal MUST be retried and the subscriber emailed by
  the processor, with no mail sent by the app (`docs/positioning.md`), and
  Settings MUST say the payment failed and how to fix it.
- **FR-011**: Deleting an account MUST cancel its subscription immediately.
- **FR-012**: Every billing control MUST show a pending state until the
  server answers and say why when it fails (Constitution VI).
- **FR-013**: Billing MUST stay hidden and inert until it is configured, so
  merging it changes nothing a user sees.
- **FR-014**: The feature MUST add no fixed cost; the processor's
  per-transaction fee is the only cost.
- **FR-015**: Checkout MUST collect no sales tax at launch, and MUST NOT
  fold tax into the price if tax is later turned on.
- **FR-016**: `/terms` MUST replace its "Stint is free" price clause with a
  Billing clause stating: the price, billed yearly in advance; automatic
  renewal until canceled; cancel online in Settings, effective at the end of
  the paid year; a reminder emailed before each renewal; a full refund on
  request within 30 days of any charge; price changes only at renewal with
  at least 30 days' notice; retries on a failed payment; and that canceling
  never takes away records or generated invoices.
- **FR-017**: The processor MUST email a reminder before each yearly
  renewal and retry a failed one up to 8 times over 2 weeks before
  canceling it.

### Key Entities

- **Subscription**: one per user at most. The processor's customer and
  subscription it mirrors, its status, the end of the current paid period,
  and whether it's set to cancel. Written only by the server from the
  processor's record.
- **Plan** (derived, not stored): free or paid, computed from the
  subscription and the time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user goes from Settings to subscribed in under two minutes.
- **SC-002**: After paying, Settings shows the paid plan within 10 seconds
  in 95% of checkouts, whether or not the processor's notification has
  arrived.
- **SC-003**: Every delivered notification, including duplicates and
  out-of-order ones, leaves the user's plan matching the processor's record.
- **SC-004**: A subscriber can cancel in under a minute without contacting
  anyone.
- **SC-005**: No invoice generated by a paying user becomes unavailable to
  them after they cancel.

## Assumptions

- No free trial: tracking is free and complete, so the free tier is the
  trial (`docs/positioning.md`).
- Stripe is the processor, in test mode until the owner configures live keys.
  Its hosted Checkout and Customer Portal, Smart Retries and failed-payment
  and renewal-reminder emails are used rather than built.
- Billing is web-only. The macOS app shows no plan; a Mac user subscribes
  from the web.
- During Alpha the section stays dark: the owner configures billing when #61's
  gate is ready, so nobody pays before there's something to pay for.
