Closes #434

# Feature Specification: Draft each scheduled invoice automatically and say when it's ready

**Feature Branch**: `f434-auto-drafts`

**Created**: 2026-10-23

**Status**: Draft

**Input**: Issue #434. A contractor on a fixed billing schedule has to
remember each period end, open Stint and create the invoice, so invoices go
out late or get forgotten. Stint should have the draft waiting and email the
user (never the client) once the period has ended, so all that's left is
download and send. Builds on billing schedules (#432), live drafts (#433)
and payment terms in days (#438). `docs/positioning.md` says "The app sends
no mail" and is reworded first: Stint never sends an invoice to a client; a
notice to the user is fine, as sign-in links already are.

Pulled in: a draft has no invoice number until its PDF is first opened,
viewed or downloaded — the moment it can reach a client. "Downloaded" below
means either. Today the number is taken
when the draft is made, so a deleted draft leaves a gap; with drafts made
automatically at the start of each period, most would. One sequence per
user, as today.

## Clarifications

### Session 2026-10-23

- Q: When should an automatic draft get its issue date (and the due date that follows from it)? → A: At first PDF download, alongside the number; until then the draft shows the date it would get today.
- Q: Should Mark sent be refused until the draft's PDF has been downloaded at least once? → A: Yes: Mark sent is disabled until the first download, with a hint saying so.
- Q: Should automatic drafts and the ready email also run for accounts on the free tier, who can't download a PDF? → A: Both run for everyone; on a free account the draft's Download asks them to upgrade, as today.

## Design

No design review: the email is a short link-only notice, and an unnumbered draft, the Mark sent hint and the Settings switches follow patterns the app already has; their stories show every state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The draft is waiting (Priority: P1)

A contractor bills Northwind semi-monthly. Without opening New invoice,
they find a draft for Northwind's period on the Invoices list, built with
the client's defaults: its rate, its payment terms, its payment details.
Work logged in the period keeps landing on it until it's sent.

**Why this priority**: The draft existing is the whole saving; the email
only points at it.

**Independent Test**: Give a client a schedule, run the daily job on a date
in or after its period, and see one draft for that period with the client's
defaults.

**Acceptance Scenarios**:

1. **Given** a client billed monthly, **When** the daily job runs on or after
   October 1, **Then** a draft exists for that client covering October 1–31,
   due by the client's payment terms, collecting October's work as it's
   logged.
2. **Given** that draft already exists, **When** the job runs again the same
   day or any later day, **Then** no second draft is made for that period.
3. **Given** the user already made a draft for those dates by hand, **When**
   the job runs, **Then** it makes none and leaves the user's draft as it is.
4. **Given** a client with no billing schedule, or an archived one, **When**
   the job runs, **Then** it makes no draft for that client.
5. **Given** a draft for a period that ended with nothing to bill, **When**
   the job runs after it ends, **Then** the draft is deleted and no email is
   sent; it never had a number, so the sequence keeps no gap.
6. **Given** the user turned automatic drafts off, **When** the job runs,
   **Then** it makes nothing for any of their clients.

---

### User Story 2 - An email says it's ready (Priority: P2)

The day after a period ends, the contractor gets one email at their own
address: which client, which period, the draft's total, and a link that
opens the draft in Stint. The invoice itself is never attached and never
sent to the client.

**Why this priority**: It's the nudge that gets the invoice out on time,
but the draft is useful without it.

**Independent Test**: Let a scheduled period end with work in it, run the
job, and find one email in the user's inbox linking to that draft.

**Acceptance Scenarios**:

1. **Given** a draft whose period ended yesterday in the user's time zone,
   **When** the job runs, **Then** the user receives one email naming the
   client, the period and the total, linking to the draft.
2. **Given** that email was sent, **When** the job runs again, **Then** no
   second email is sent for that draft.
3. **Given** the user already marked the draft sent, or deleted it, before
   the period ended, **When** the job runs, **Then** no email is sent.
4. **Given** the user turned the ready email off, **When** a period ends,
   **Then** the draft is still made and no email is sent.
5. **Given** an email that fails to send, **When** the job runs the next day,
   **Then** it tries again, and stops once one has been sent.

---

### User Story 3 - A draft is numbered when it can first reach a client (Priority: P1)

A draft, made by hand or by the schedule, shows no invoice number. The
first PDF download gives it the next number in the user's one sequence,
and it keeps that number through every later download, Mark sent and
void.

**Why this priority**: Automatic drafts made at the start of every period
would otherwise each take a number, and the empty ones deleted would leave
gaps in a sequence promised to have none.

**Independent Test**: Make two drafts, download the second's PDF, then the
first's: the second is numbered before the first, and deleting a draft
never downloaded leaves the next number unchanged.

**Acceptance Scenarios**:

1. **Given** a new draft, **When** it's shown in the list, its detail or the
   inbox, **Then** it reads as a draft for its client and period, with no
   number.
2. **Given** a draft never downloaded, **When** its PDF is downloaded,
   **Then** it takes the next number and that day's issue date, its due date
   follows from its payment terms, and the PDF prints all three. Until then
   it shows the dates it would get that day.
3. **Given** a numbered draft, **When** its PDF is downloaded again, **Then**
   it keeps its number.
4. **Given** a draft never downloaded, **When** it's deleted, **Then** the
   next invoice number is unchanged.
5. **Given** New invoice, **When** it's filled in, **Then** it says the
   number is given when the PDF is first downloaded, rather than predicting
   one.
6. **Given** drafts that already have numbers, **When** this ships, **Then**
   they keep them.
7. **Given** a draft never downloaded, **When** its detail is shown,
   **Then** Mark sent is disabled with a hint to download the PDF first, and
   the server refuses a Mark sent that arrives anyway.

### Edge Cases

- The job runs twice in a day, or two runs overlap: still one draft per
  client and period, and at most one email per draft.
- The job misses a day: the next run catches up on every period it missed,
  one draft each.
- A period ends at midnight in the user's time zone, not the server's: a US
  user in the evening sees no email for a period that hasn't ended where
  they are.
- The user's time zone is unknown (never recorded): the job uses UTC until
  one is recorded.
- A client's schedule changes mid-period: drafts already made keep their
  dates; the next draft follows the new schedule.
- The user lacks a business name or email, which a new invoice requires: no
  draft is made, and the inbox says why, once.
- An entry dated in the period is unrated: the draft is still made and the
  existing unrated warnings apply when it's read and sent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Once a day, Stint MUST make a draft for each active client
  with a billing schedule whose current period has started, unless an open
  or sent invoice for that client already covers any of those dates. The
  draft collects the period's work as it's logged.
- **FR-002**: An automatic draft MUST use what New invoice would choose by
  default for that client and period: grouping, payment terms, payment
  details.
- **FR-003**: The day after a draft's period ends in the user's time zone,
  Stint MUST email the user once, at their sign-in address, with the
  client, the period, the total and a link to the draft.
- **FR-004**: The email MUST never go to a client, never attach the
  invoice, and never carry payment details.
- **FR-005**: Running the job twice, concurrently or after a missed day,
  MUST make no second draft for a period and send no second email for a
  draft.
- **FR-006**: The user MUST be able to turn off automatic drafts, and
  separately the ready email, in Settings; both default to on.
- **FR-007**: An automatic draft whose period ended with nothing to bill
  MUST be deleted the next time the job runs, with no email.
- **FR-011**: A draft MUST have no invoice number until its PDF is first
  downloaded, when it takes the next in the user's one sequence and keeps
  it. Drafts numbered before this ships keep their numbers.
- **FR-012**: Mark sent MUST be refused for a draft without a number.
- **FR-013**: A draft's issue date MUST be fixed at its first download, in
  the user's time zone, with its due date that date plus its client's
  payment terms, else the user's. A due date picked on New invoice is kept
  as picked.
- **FR-008**: The user's time zone MUST be recorded from the app so "period
  ended" is judged where the user is.
- **FR-009**: The job MUST add no fixed cost: a daily scheduled job on the
  current hosting, and mail through the sender already used for sign-in.
- **FR-010**: `docs/positioning.md` MUST be reworded before this ships:
  Stint never sends an invoice to a client; a notice to the user is fine.

### Key Entities

- **Automatic draft**: an ordinary draft invoice, marked as made by the
  schedule, for one client and one scheduled period.
- **Invoice number and issue date**: empty on a draft until its first
  download, then fixed together.
- **Ready notice**: the record that a draft's ready email went out, so it
  goes once.
- **User's time zone and switches**: where the user is, and whether they
  want automatic drafts and the email.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a scheduled client with work in a period, the draft
  exists by the day after the period ends with no action from the user.
- **SC-002**: The user gets exactly one email per automatic draft, within a
  day of its period ending.
- **SC-003**: No client ever receives mail from Stint.
- **SC-004**: Running the job any number of times in a day yields the same
  drafts and emails as running it once.
- **SC-005**: The monthly hosting bill does not change.
- **SC-006**: Deleting drafts never leaves a gap in the invoice numbers.

## Assumptions

- The billing schedule is already a per-client opt-in, so there is no
  separate per-client switch; the Settings switches cover the user who
  wants none.
- Automatic drafts and the ready email run for every account. Downloading
  stays the paid tier, so a free account's drafts stay unnumbered and its
  Download asks it to upgrade, as today.
- The link opens the draft in the app.
- Mail goes through the provider that already sends sign-in links, within
  its free tier at this scale.
- A client without a schedule is untouched; New invoice works as today.
- The job acts with server-side access across users, scoped per user in
  its queries; no client can trigger it.
