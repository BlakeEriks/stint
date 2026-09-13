# Writing the docs

Applies to everything under `docs/`.

## Format follows content

**Anything visual is HTML**, written in the app's own design system so the
spec doubles as the visual reference: `design/brand.html`,
`design/screens/*.html`, `design/menubar.html`, `design/landing.html`.

**Anything architectural or procedural is Markdown**: `api.md`,
`data-model.md`, `architecture.md`, `deploying.md`, `local-dev.md`,
`tasks.md`, `design/principles.md`, `design/deriving-colour.md`.

`pnpm design` serves them at `localhost:8778`. Start a screen doc by copying
`design/screens/_shell.html`; the index and nav are built by reading the
directory, so there is no list to update.

## A sentence earns its place only if the page cannot show it and CI cannot
enforce it

Both filters, every time.

**Show, don't tell.** A type table that sets each role *in* that role has
already said "numbers are mono". A swatch showing one colour has already said
"never two". Delete the caption, keep the picture.

**CI is not documentation.** `check:type`, `detox`, `tokens:validate` and
`test:ui` run on every push, so the rules they enforce are already
unbreakable. "CI rejects anything off the scale" is the whole sentence; how it
does that belongs in the script.

What survives is three things per section: **what it is**, **where it goes**,
and **the one thing neither a rendering nor a test can say** — usually a
meaning. Green marks the live thing. Colour belongs to the client. Those
constrain a decision you would otherwise get wrong.

Measurements go in **tables**, not sentences.

## Say what it is, not what it isn't

A doc that lists prohibitions is defining the thing by its complement, and it
grows every time someone makes a decision. Both failure modes have already
happened here: first as decision logs ("this used to say…"), then as
"Never" bullets.

A negation survives only when it is **contrastive** — "colour belongs to the
client, not the project" defines by distinction — or when someone would
plausibly do the thing and it would be **wrong in a way that costs money**:
unbilled and awaiting-payment must never be summed.

Everything else: state the rule positively, or let the page show it.

## One subject, one doc

One screen, one doc; states are sections inside it. A doc never points at its
siblings — that is the index's job, and a second list drifts.

Unbuilt work goes to `tasks.md`. A rejection goes to `design/principles.md`
only if someone would plausibly propose it again; that file is a short list of
live refusals, not an archive.

Git holds the history. A doc states the current final form.

## Keeping it tight

`/trim <path>` measures a doc — word count, how many blocks open with a
prohibition, blocks that only restate CI — and reports candidates before
anything is cut.

It counts prohibitions (a block *opening* "Never…") rather than every "not",
because the contrastive kind is doing real work and flagging it produced a
checker nobody would read.
