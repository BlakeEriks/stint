# Problem Definition: Projects get shades of their client's color

- **Slug**: project-shades
- **Created**: 2026-09-28
- **Inputs used**: intake.md, research.md, one answer from Blake

## Problem Statement

A contractor with one client sees a single color across the home page, so the
panel looks flat. Blake confirmed no information is missing: project names and
amounts already show which project the time went to. The pain is visual
monotony, not a gap in what the user can learn.

## Affected Users & Stakeholders

- **Users**: a solo contractor with one client and several projects — the home page reads as monochrome. Blake is the only confirmed case (research: Users & Demand).
- **Stakeholders**: Blake — owns the design rules (`principles.md`, `CLAUDE.md`) that tie color to the client, and decides the gate.

## Goals

- A single-client home page does not read as flat.
- Color keeps one meaning wherever it appears, so a reader never has to learn a second key.

## Non-Goals

- Telling projects apart by color. Blake said this is not the pain, and names already do it.
- Changing the calendar, entry list, project picker, or macOS app.
- Changing how multi-client users see the home page.
- Any change to the accent or `success` greens.

## Success Metrics

- Qualitative: Blake, looking at his own single-client home page, no longer calls it flat (baseline: calls it flat).
- A reader can still answer "whose work is this?" from color alone on every surface (baseline: yes).

## Cost of Inaction

The home page stays monochrome for single-client users. No data is hidden,
no bill is wrong, and nothing suggests a user signs up or leaves over it. By
the Feature form's own test, this is annoyance, which does not qualify on its
own.

## Open Questions

- [NEEDS CLARIFICATION: Is flatness specific to one client, or does the panel look flat with any data? If the second, the fix is the panel's design, not the palette.]
- [NEEDS CLARIFICATION: Would the panel still look flat after other in-flight color work lands (#15, #125, #128)?]
- [NEEDS CLARIFICATION: Which gate does it block — Alpha, Launch, or neither? The evidence so far points to neither.]
