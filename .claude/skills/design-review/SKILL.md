---
name: design-review
description: Offer a design review for a feature that adds or changes UI - draft 3-5 variations of each screen as one HTML page, iterate with Blake until he picks, then record the pick in the spec. Use after /speckit-clarify and before /speckit-plan.
argument-hint: "[screen or guidance]"
# Follows the official `playground` plugin's design-playground template: one
# self-contained HTML file, 3-5 named presets, a live preview. Custom because
# nothing fits whole. Spec Kit's catalog has `wireframe` (grey SVG wireframes,
# one design, not variations), `preview` (one preview of the spec) and
# `design-system` (implements autonomously); all are discovery-only and
# unvetted. `playground` tunes one component through controls and invents its
# own theme; `frontend-design` invents a new look. Stint has a design system,
# and the review picks between whole presentations of a screen in it.
---

Take the current feature from a clarified spec to a chosen look, before
`/speckit-plan`. `.specify/extensions.yml` runs this before every plan.

## 0. Gate

Find the spec: `.specify/scripts/bash/check-prerequisites.sh --json --paths-only`
gives `FEATURE_SPEC` and `FEATURE_DIR`.

- **The spec has a `## Design` section**: the pick or the skip is recorded.
  Say which in one line and stop.
- **Otherwise, offer it; never assume it.** Name the screens the spec adds or
  changes and ask Blake: review them, or skip. A change with no visible UI or a
  trivial one is a fine skip; say so when it is.
- **On a skip**, add `## Design` above `## User Scenarios & Testing` holding
  `No design review: <why>.`, commit it, and stop.

## 1. Draft the variations

One scratch HTML page in the session's scratchpad, holding 3-5 distinct
presentations of each new or changed screen. Distinct means a different
layout or hierarchy, never the same layout recolored.

| The page has | From |
| --- | --- |
| A switcher between variations, and between the states the spec's scenarios name (empty, one record, many) | the page's own script |
| Desktop and Phone toggles; Phone is 390px wide | the page's own script |
| Dark and Light toggles, setting `data-theme` on `<html>` | `mockup.css` defines both |
| The seeded account's data: its clients, projects, rates and money | `apps/web/src/mocks/fixtures.ts` |
| Color, type, shadow and motion | `packages/design-tokens/dist/mockup.css`, inlined in a `<style>`, so the file stands alone once saved |

Style only with the design system: a `var(--…)` token for every color and a
`type-*` class for every piece of text. The app's rail and page header frame
each variation, so it reads as the app. Under the switcher, each variation
says in one line what it is best at and what it costs.

Open it in the browser pane (`preview_start` with its `file://` URL) and ask
Blake to pick.

## 2. Pick and refine

Blake picks one, mixes ("A's cards with B's color"), or asks for changes.
Redraft the same file with the next round's variations, bump the round in its
`<title>`, and reload. Repeat until he says it's right.

A token or type role the pick needs that the system lacks is named in that
round, as a change to `packages/design-tokens/tokens.json` the plan carries.
It is never a literal in the page.

## 3. Record the pick

1. Cut the page down to the pick and its states, and save it as
   `specs/<feature>/design/<screen>.html`.
2. Add `## Design` to the spec, above `## User Scenarios & Testing`. The
   first line points at the file; then one bullet per region of the layout
   and per state, saying what it shows and does. It states the design in its
   final form: no rejected variations, no rounds.
3. Commit both on the feature branch, unpushed.

End with the file's path and the next step: `/speckit-plan`, which builds
this look.
