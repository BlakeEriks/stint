# Idea Research: Projects get shades of their client's color

- **Slug**: project-shades
- **Created**: 2026-09-28
- **Evidence confidence (overall)**: medium

## Users & Demand

- Blake, the only user, has one client and sees one color across the home page. — [source: chat, 2026-09-28] (confidence: high)
- One client with several projects is called "the common solo shape"; that user's month strip is one flat segment and their heatmap one color. — [source: issue #66] (confidence: medium — stated, not measured)
- No other user has asked for it; the product is pre-Alpha. — [source: `gh issue list --search color`, no milestone on #66] (confidence: high)
- It is not known whether a single-client user needs to tell projects apart by color, or whether the names already drawn are enough. — ASSUMPTION gap (confidence: low)

## Prior Art

- **Issue #66, "A project takes a shade within its client's hue"** (open, `feature`, no milestone, filed 2026-09-26) already proposes this idea. It specifies:
  - `projects.color` stores a shade index (`smallint` plus a check constraint), not a hex.
  - Four lightness steps at constant hue, ΔL 0.080: `0.780/0.098`, `0.700/0.111`, `0.620/0.118`, `0.540/0.115`, none gamut-clipped at any of the eight hues.
  - Step 2 is the client's own color, so an unset project renders what it renders today. Four is the ceiling.
  - Shades reach the week's bars and the month's strip, never the heatmap. On the heatmap, shade lightness inverts against the hours opacity: step 1 at 35% lands darker than step 4 at 100%.
  - `CLAUDE.md`'s "only clients have a color" becomes "a client owns a hue; a project may take a step on it".
  - It notes the gate's four answers are still owed. — [source: issue #66]
- `projects.color` exists as a dead `text` column whose drop was canceled for #66. — [source: `docs/data-model.md:96-99`]
- The eight client colors are a closed set at one lightness and one chroma (`L 0.700`, `C 0.110`), well below the accent, so no chip can out-bright the running timer. — [source: `docs/design/screens/clients.html:350-360`]
- Competitors Toggl, Clockify, and Harvest let each project take its own color. — ASSUMPTION from general product knowledge (confidence: medium)

## Market & Context

- Today a single-client user tells projects apart by name: Today's rows name each project, and "By project" draws a name over each bar. — [source: `git log` 8e462a1b, 7cca216a] (confidence: medium)
- Color is not part of the product's pitch; positioning is about seeing money and invoicing. — [source: `docs/positioning.md`] (confidence: high)
- The cost of doing nothing is a monochrome home page for single-client users. It hides no data, because names and amounts remain. — ASSUMPTION (confidence: medium)

## Data & Constraints

- **The home rollups are keyed by client, not by project.** `Stats['month']['byClient']` feeds the strip (`home-month.tsx:128-147`), and the week's bars take `byClient` (`home-week.tsx:185`). Shading them per project needs a per-project breakdown from the stats endpoint, which changes `/api/v1`. — [source: code] (confidence: high)
- `useProjectColors()` feeds Today, the entry list, the entry dialog, the calendar, the project picker, and task suggestions; `TimerModel.swift` mirrors it on macOS. — [source: `git grep useProjectColors`] (confidence: high)
- The eight client hues are hand-authored in `tokens.json` with no generator. `generate.js`, `color-picker.tsx`, and three emitted formats assume that flat shape, so a shade generator is the long pole. — [source: issue #66] (confidence: medium, not re-verified)
- The legend is one entry per client; one swatch stands for a client's projects. Shades raise whether the legend lists projects, which makes it longer. — [source: `docs/design/screens/home.html:655-675`, `use-project-colors.ts:36-41`]
- Principles tie color to one question: whose work is this? A shade answers a second question, which project. — [source: `docs/design/principles.md:94`, `clients.html:329-331`]
- Open bug #128: the calendar legend files a colorless client's work under "No client". Legend grouping is already fragile. — [source: issue #128]
- Open bug #15: in light theme the running timer and the primary action are the same green. Color budget work is already in flight. — [source: issue #15]

## Evidence Against the Idea

- **Demand is one user, one shape.** A contractor with two or more clients already gets distinct colors, and nothing shows single-client users are leaving or not signing up over it. The Feature form rejects "annoyance".
- **It weakens a one-meaning rule.** Color answers "whose work is this?". Four shades of one hue answer "which project?" only approximately, and adjacent steps at ΔL 0.080 may be hard to tell apart on small segments, especially in light theme.
- **The cost is structural, not cosmetic**: a stats API change, a column retype, a token generator, a picker change, legend redesign, macOS parity, and a `CLAUDE.md` rule change.
- **The heatmap cannot take shades** (issue #66), so the panel would mix per-project and per-client color, which reintroduces the two-keys problem the single legend exists to prevent.
- **Four steps cap it.** A client with five or more projects repeats shades, which is the same ambiguity with more machinery.

## Gaps & Open Questions

- [NEEDS CLARIFICATION: Does the home page need color to separate projects, or would named segments or a per-project breakdown without shades answer the same need?]
- [NEEDS CLARIFICATION: Is a shade set by the user (per project) or assigned automatically, and what happens past four projects?]
- [NEEDS CLARIFICATION: Are ΔL 0.080 steps distinguishable in light theme and at the strip's thickness? Not yet checked in `brand.html`.]
- [NEEDS CLARIFICATION: Does the legend list projects when a client has shades, and how does that interact with #128?]
- [NEEDS CLARIFICATION: Does macOS need shades, given it shows only the timer and the menu bar?]
- [NEEDS CLARIFICATION: Which gate does it block — Alpha, Launch, or neither?]

## Sources

- https://github.com/BlakeEriks/stint/issues/66 (host: github.com, policy: allowlisted, via `gh`)
- https://github.com/BlakeEriks/stint/issues/128 (host: github.com, policy: allowlisted, via `gh`)
- https://github.com/BlakeEriks/stint/issues/15 (host: github.com, policy: allowlisted, via `gh`)
- Repository: `apps/web/src/lib/client/use-project-colors.ts`, `apps/web/src/components/home-{month,week,shell}.tsx`, `docs/data-model.md`, `docs/design/principles.md`, `docs/design/screens/{home,clients}.html`, `docs/positioning.md`
