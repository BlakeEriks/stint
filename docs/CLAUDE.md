# Writing the docs

Applies to everything under `docs/`, and to `CLAUDE.md`.

## Format follows content

**A web screen is a Storybook story, not a doc.** Every screen has a
`*.stories.tsx` beside its component that renders the real thing, so the reference cannot drift from the app; why it is that way is a
comment at the line. `.claude/rules/web-ui.md` has the conventions and
`docs/local-dev.md` the commands.

**The macOS panel is HTML**, `design/menubar.html`, written in the app's own
design system because Storybook cannot render SwiftUI. Open it from disk.

**Its color comes from `design/_mockup.css`**, which `pnpm tokens` generates.
`tokens:validate` rejects a hex literal in any doc's stylesheet, because a
stale one renders perfectly and quietly misrepresents the app. A surface that
genuinely is not app chrome — the invoice PDF on white paper — opens its block
with `not-app-chrome:` and a reason.

**Anything architectural or procedural is Markdown**: `api.md`,
`data-model.md`, `architecture.md`, `deploying.md`, `local-dev.md`,
`macos.md`, `positioning.md`, `sdlc.md`, `design/deriving-color.md`.

## A sentence earns its place only if nothing else already says it

Four things say it better, and each is a filter to apply before writing:

**The page can show it.** A type table that sets each role *in* that role has
already said "numbers are mono". A swatch showing one color has already said
"never two". Delete the caption, keep the picture.

**CI enforces it.** `check:type`, `detox`, `tokens:validate` and `test:ui` run
on every push, so those rules are already unbreakable. "CI rejects anything
off the scale" is the whole sentence; how it does that belongs in the script.

**A config file owns it.** `ci.yml`, `dependabot.yml`, `biome.jsonc` and the
tsconfigs carry their own rationale in comments, at the line someone would
change. A doc repeating it is a second copy that drifts — and the comment is
better placed, because it is read at the moment of editing.

**The line it governs owns it.** A rule about one screen is a comment where
that screen is built, and its look is its stories. `CLAUDE.md` keeps only what
constrains code anywhere in the repo.

What survives is three things per section: **what it is**, **where it goes**,
and **the one thing none of those four can say** — usually a meaning. Green
marks the live thing. Color belongs to the client.

Measurements go in **tables**, not sentences.

## Say what it is, not what it isn't

Naming what we rejected is what plants the idea. Nobody was going to propose
per-project colors until a doc explained why we did not have them.

A negation survives only when it is **contrastive** — "color belongs to the
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

One subject, one doc, and a doc never keeps a list of its siblings: a second
list drifts. A screen's states are its stories, not a doc's sections.

A new capability is a GitHub issue labeled `feature`, a fault or an
improvement one labeled `bug` or `enhancement`. A rejection is deleted —
the constitution holds what we hold to, never a record of what was turned
down.

## Keeping it tight

Vale lints prose against the Google developer documentation style guide
and the house rules above that a pattern can catch (`.vale/styles/Stint`).
It annotates the lines a PR adds, and `/copyedit <path>` fixes a doc. An
alert is a candidate; it never decides.

`scripts/doc-refs.mjs` fails `verify:static` when a foundational doc names a
path, a `pnpm` script or a story title that does not exist.

**Verify the rendered page, not only the numbers.** Geometry checks here have
passed while the page read as broken.
