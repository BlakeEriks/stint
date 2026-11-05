# Voice

How every word Stint shows reads: each app, the landing page, email,
notifications, and the invoice PDF. `docs/positioning.md` says who the reader
is; this doc says how to talk to them.

The **voice** never changes, the **tone** follows what is at stake, and the
**mechanics** keep it consistent.

## Voice

The reader works for themselves. They chose their clients and set their
rate, and nobody signs off on their hours. Stint is the back office they would
otherwise keep by hand, and it talks like a good one: few words, all of them
true.

| Trait | Sounds like | Not like |
| --- | --- | --- |
| **Direct** | Who's paying you? | Get started by creating your first client. |
| **Exact** | 14h 32m since 6:12 PM Tuesday | Your timer has been running for a while. |
| **Independent** | No seats, no team plan, no sales call. | Upgrade your workspace to unlock more. |
| **Unsentimental** | Request failed. Tracked time is unaffected. | Something broke, but your hours are safe. |

**Direct.** The shortest version that carries the meaning, in everyday
words. A longer one is never the better one. A term a new reader may not know
is explained where it appears; internal vocabulary stays internal.

**Exact.** A real figure replaces every vague word: an amount, a duration, a
date, a count, a limit such as 24 hours.

**Independent.** The reader runs a business of one and is in charge of it.
The copy never borrows the furniture of software sold to companies: seats,
teams, workspaces, members, features to unlock. It states a price once, with
what it buys, and never pushes.

**Unsentimental.** Facts, not feelings. A line that reassures, cheers,
or leans on an idiom or catchphrase is cut: *time to bill*, *money on the
table*, *your hours are safe*. Humor is not part of the voice.

## Who speaks

- **You** is for the reader acting: *Add a client and what you charge them.*
  A sentence describing the product states the fact instead: *Every hour is
  priced at its client's rate.*
- When the product did or did not do something, the subject is **we**:
  *We left the entry as it was.*
- **Stint** is a name, as in *Stint sign-in code*. It never knows, decides,
  or does anything.
- Most text needs no subject at all: *That code didn't work.*

## Tone by moment

| Moment | How it reads |
| --- | --- |
| Landing page | The most voice: short declaratives, and the price with what it buys. |
| Routine screens and empty states | An empty state names the job, and its button does it. |
| A record to resolve | The fact with its figures, then each choice as a button. It never guesses or blames. |
| Error | Impersonal: what failed, what it left untouched, and one action. |
| Money, and anything that can't be undone | The plainest: what changes, its figures, and whether it comes back. |
| Email | The subject carries the payload. The body states the limits, and what to do if it was not expected. |
| Notification | The title is the fact; the body is the figure and the next step. |

## Mechanics

The Google developer documentation style guide is the base. Stint adds:

- **Sentence case** for every title, label, and button.
- **Contractions** as people say them: didn't, can't, isn't.
- **No** exclamation points, *please*, *successfully*, *simply*, or *just*.
- **A question asks the reader for something**: a decision (*Void
  INV-0042?*), the first piece of data (*Who's paying you?*), or an FAQ
  entry. A rhetorical question is a statement instead.
- **A button names its action**, a verb and its object: *Void invoice*, *Send
  a new code*. The button that backs out names what stays: *Keep it*.
- **A sublabel exists only if it adds something**: it resolves an ambiguous
  name, states a unit or format, or explains a consequence. Otherwise there
  is none.
- **US formats**, as `packages/core/src/format.ts` and `duration.ts` write
  them: `$4,250.00` for a billed figure and `$6,180` for one read at a
  glance; `6:12 PM`; `14h 32m`.
- **The price** is `$3.33/month`, with *billed annually* beside it.

## Reference lines

Owner-approved text. A new line in the same moment matches these. The
landing lines show the voice; what the landing page holds is decided
elsewhere.

| Moment | Text |
| --- | --- |
| Landing hero | **Time tracking and invoicing for solo contractors.** No seats, no team plan, no sales call. Track for free, invoice for $3.33/month. *(billed annually)* [Request an invite] *Invite-only during alpha. No card.* |
| Landing section | **The invoice your client gets.** Hours grouped by task, at the rate each was worked. Numbered, dated, ready to send. |
| FAQ | **Does Stint email invoices to my clients?** No. You download the PDF and send it from your own address, so it stays out of spam. |
| Empty client list | **Who's paying you?** Add a client and what you charge them. [Add client] |
| Timer left running | **Your timer ran overnight.** 14h 32m since 6:12 PM Tuesday. Keep it, or set when you stopped. [Keep 14h 32m] [Set end time] |
| Wrong sign-in code | That code didn't work. Codes work once and expire after 24 hours. [Send a new code] |
| Void invoice | **Void INV-0042?** Its 38 entries ($4,250.00) go back to unbilled, ready for a new invoice. INV-0042 isn't reused. You can't undo this. [Void invoice] [Keep it] |
| Server error | Request failed. Tracked time is unaffected. [Retry] |
| Sign-in email | Subject *Sign in to Stint*. [Sign in] Or enter this code in the Mac app: 482 913. The link and code work once and expire after 24 hours. If you didn't request this, ignore this email. |
| Month-end notification | **October is over.** $6,180 of work is unbilled across 3 clients. Create the invoices. |
| Paid plan | Downloading an invoice requires the paid plan: $3.33/month, billed annually. [Upgrade] |
