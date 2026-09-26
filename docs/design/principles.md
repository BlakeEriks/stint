# Product Principles

`docs/positioning.md` says who this is for and what it charges. This file says
what that means for the product.

## The test

Every feature is measured against one question: **does this help one
contractor track time and get paid?**

Not "is it useful" — most things are useful to someone. The subject of that
sentence is one person, and the object is getting paid.

## Money

**The invoice is the product.** Time tracking is the input and it is free.
What the user pays for is a document their client takes seriously: a gapless
number, rates frozen at generation, their bank details on it. Everything in
the app either produces that document or gets out of its way.

**Earned leads, because it is the only figure that grows all month.**
Bucketed by when the work was done, never by when it was invoiced or paid, so
it must not move when an invoice is sent. A contractor who invoices at the
halfway mark would watch a headline built on anything else collapse to zero
with two weeks of work still ahead of it — a number that resets is not a
headline, whatever it measures.

**Unbilled is the figure a competitor cannot show**, and it sits beside
earned rather than above it. How much work is done and not yet invoiced is
the question a contractor cannot answer from memory, and a tracker that does
not know rates structurally cannot ask it. It is a balance: it climbs while
you work and resets when you invoice, which is exactly why it is a reading
rather than the headline.

**Collected, awaiting and unbilled are never summed.** Three stages of one
pipeline, and any two added double-count the same hours. Awaiting has an
invoice, a due date and someone who owes it; unbilled can still be discounted,
written off, or never billed. A total would lend the second the authority of
the first.

## Trust

This is a billing system. Every rule below exists because a wrong number costs
the user money and the app credibility.

**One timer per user, enforced by a database index.** Not a constraint to work
around — the organizing principle. Overlapping entries are impossible rather
than cleaned up later, which is what makes the invoice trustworthy.

**The app never silently modifies user data.** A suspect record is surfaced
for the user to resolve, never corrected on their behalf — and this holds even
when the correction would be right, because the user cannot tell that it
happened. Surfacing costs one prompt; silent correction costs confidence in
every number the app reports.

**Rates freeze onto invoices at generation**, and so do payment details.
Changing a client's rate next year must never alter an invoice already sent.

**Preview before anything irreversible.** Generation allocates a gapless
number and locks entries, so it is always preceded by a preview with no side
effects.

**Archive, don't delete.** Invoices reference clients and projects, and the
user's records are theirs for three to seven years.

**Invoices go out from the user's own address.** We render the PDF; they send
it. Mail from a shared application domain gets filtered on the way to a client
and the sender finds out when the client says it never arrived. Sending it
themselves uses their own domain's reputation and leaves a copy in their Sent
folder.

## The screen

**Home is where the habit lives.** Invoicing is monthly; a tool used once a
month gets canceled. The daily open is the timer, and that habit is what
keeps the subscription. Home's job is to be worth opening.

**A card ships only if it carries a number the user cannot compute in their
head, or a row they can click to act on.** "Interesting" is not the bar.

**A figure that moves must be true.** The month projection earns its place
because it answers *will this be a good month* from real data. A metric
invented to produce a feeling — a streak, a compliance score — measures
showing up rather than getting paid, and rewards the wrong thing.

**Where a gesture writes, it is made deliberate rather than removed.** A
calendar block can be dragged to correct its times — the place you notice a
mistake should be the place you fix it — so the gesture gets a threshold and a
snap, and it never re-derives a value it was only asked to move.

## Color and type

Visual rules live in `design/brand.html`, where they can be seen rather than
described. One meaning carries into code: **color belongs to the client**,
resolved through `useProjectColors()`, and internal work gets none. The
accent's two jobs — the running timer and the one confirm action — are in
`CLAUDE.md`, which every session loads.

## Platform scope

The web app is where features are built. The native apps exist for what only
they can do: **macOS** is menu bar presence and the timer; **mobile** is
starting and stopping away from the desk. Neither is a port, and neither
should grow into one.
