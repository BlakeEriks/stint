---
name: design-review
description: Offer a design review for a feature that adds or changes UI - draft each screen as one HTML page, iterate with Blake until he says it's right, then record the design in the spec. Use after /speckit-clarify and before /speckit-plan.
argument-hint: "[screen or guidance]"
# Follows the official `playground` plugin's design-playground template: one
# self-contained HTML file, named presets, a live preview. Custom because
# nothing fits whole. Spec Kit's catalog has `wireframe` (grey SVG
# wireframes), `preview` (one preview of the spec) and
# `design-system` (implements autonomously); all are discovery-only and
# unvetted. `playground` tunes one component through controls and invents its
# own theme; `frontend-design` invents a new look. Stint has a design system,
# and the review drafts whole presentations of a screen in it.
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

## 1. Draft

One scratch HTML page in the session's scratchpad, holding a draft of each
new or changed screen. One draft is the default. Add variations only when
the screen has a real choice of layout or hierarchy that Blake should see
side by side, and then at most 3; a variation is never the same layout
recolored.

| The page has | From |
| --- | --- |
| A switcher between the states the spec's scenarios name (empty, one record, many), and between variations when there are any | the page's own script |
| Desktop and Phone toggles; Phone is 390px wide | the page's own script |
| Dark and Light toggles, setting `data-theme` on `<html>` | `mockup.css` defines both |
| The seeded account's data: its clients, projects, rates and money | `apps/web/src/mocks/fixtures.ts` |
| Color, type, shadow and motion | `packages/design-tokens/dist/mockup.css`, inlined in a `<style>`, so the file stands alone once saved |

Style only with the design system: a `var(--…)` token for every color and a
`type-*` class for every piece of text. The app's rail and page header frame
each screen, so it reads as the app. Under the switcher, each variation
says in one line what it is best at and what it costs.

Open it in the browser pane (`preview_start` with its `file://` URL) and ask
Blake for changes, or a pick when there are variations.

## 2. Refine

Blake asks for changes, or picks or mixes variations ("A's cards with B's
color"). Redraft the same file, bump the round in its
`<title>`, and reload. Repeat until he says it's right.

A token or type role the pick needs that the system lacks is named in that
round, as a change to `packages/design-tokens/tokens.json` the plan carries.
It is never a literal in the page.

## 3. Record the design

1. Cut the page down to the final design and its states, one
   `specs/<feature>/design/<screen>.html` per screen.
2. Add `## Design` to the spec, above `## User Scenarios & Testing`. Its
   first line links each file; then one bullet per region of the layout
   and per state, saying what it shows and does. It states the design in its
   final form: no rejected variations, no rounds.
3. Commit both on the feature branch, unpushed.

End with the files' paths and the next step: `/speckit-plan`, which builds
this look.

## Unattended

`/work-issues`' builder runs this with Blake away, so nobody answers the
gate's question: it decides review or skip itself (`issue-builder.md`).
Its rounds change only in where the page lives and how Blake answers:

- **Draft** the one page into `specs/<feature>/design/review.html`, commit
  it and push the branch, so the draft survives the wait. Then stop and
  report `design-review: <absolute path>`. The loop publishes the page and
  asks on the issue. Step 3 cuts it into its screens' files and deletes it.
- **Refine** on each reply of Blake's on the issue, which comes back to you
  as a message: redraft the same file, commit, push, and report again.
- **Record** when he picks or says it's right: step 3, then go on to
  `speckit-plan`.
