# Writing the docs

Applies to everything under `docs/`, and to `CLAUDE.md`.

## Format follows content

**Anything visual is HTML**, written in the app's own design system so the
spec doubles as the visual reference: `design/brand.html`,
`design/screens/*.html`, `design/menubar.html`, `design/landing.html`.

**Anything architectural or procedural is Markdown**: `api.md`,
`data-model.md`, `architecture.md`, `deploying.md`, `local-dev.md`,
`macos.md`, `roadmap.md`, `defects.md`, `positioning.md`,
`design/principles.md`, `design/deriving-colour.md`.

`pnpm design` serves them at `localhost:8778`. Start a screen doc by copying
`design/screens/_shell.html`; the index and nav are built by reading the
directory, so there is no list to update.

**Colour comes from `screens/_mockup.css`**, which `pnpm tokens` generates.
`tokens:validate` rejects a hex literal in any doc's stylesheet, because a
stale one renders perfectly and quietly misrepresents the app. A surface that
genuinely is not app chrome — the invoice PDF on white paper — opens its block
with `not-app-chrome:` and a reason.

## A sentence earns its place only if nothing else already says it

Four things say it better, and each is a filter to apply before writing:

**The page can show it.** A type table that sets each role *in* that role has
already said "numbers are mono". A swatch showing one colour has already said
"never two". Delete the caption, keep the picture.

**CI enforces it.** `check:type`, `detox`, `tokens:validate` and `test:ui` run
on every push, so those rules are already unbreakable. "CI rejects anything
off the scale" is the whole sentence; how it does that belongs in the script.

**A config file owns it.** `ci.yml`, `dependabot.yml`, `biome.jsonc` and the
tsconfigs carry their own rationale in comments, at the line someone would
change. A doc repeating it is a second copy that drifts — and the comment is
better placed, because it is read at the moment of editing.

**A screen doc owns it.** A rule about one screen belongs in that screen's
doc. `CLAUDE.md` keeps only what constrains code anywhere in the repo.

What survives is three things per section: **what it is**, **where it goes**,
and **the one thing none of those four can say** — usually a meaning. Green
marks the live thing. Colour belongs to the client.

Measurements go in **tables**, not sentences.

## Say what it is, not what it isn't

Naming what we rejected is what plants the idea. Nobody was going to propose
per-project colours until a doc explained why we did not have them.

A negation survives only when it is **contrastive** — "colour belongs to the
client, not the project" defines by distinction — or when someone would
plausibly do the thing and it would be **wrong in a way that costs money**:
unbilled and awaiting-payment must never be summed.

Two shapes to delete on sight:

- **Defining by absence.** "…over a plain Postgres connection — no CLI, no
  pasting SQL into a dashboard" describes two workflows we do not have.
- **History as justification.** A rule followed by a narration of what the old
  version did. "As a banner it took the bar from 96px to 140px" is the same
  fluff as a decision log, one sentence shorter.

Git holds the history. A doc states the current final form.

## One subject, one doc

One screen, one doc; states are sections inside it. A doc never points at its
siblings — that is the index's job, and a second list drifts.

`screens/components.html` is the exception, and the only one: it is what a
screen is assembled *from*, so a rule that would otherwise be restated in
every screen doc belongs there instead.

Unbuilt work goes to `roadmap.md`. A rejection is deleted — `principles.md`
holds what we believe, never a record of what was turned down.

## Keeping it tight

`/trim <path>` measures a doc and reports candidates before anything is cut.

It counts **prohibitions** (a block *opening* "Never…") rather than every
"not", because the contrastive kind is doing real work — flagging it produced
5 false positives out of 7 and a checker nobody would read. The regex finds
candidates; it never decides.

**Verify the rendered page, not only the numbers.** Geometry checks here have
passed while the page read as broken.
