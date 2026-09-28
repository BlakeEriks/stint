# Decision: Projects get shades of their client's color

- **Slug**: project-shades
- **Decided**: 2026-09-28
- **Verdict**: kill
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | weak | Blake confirmed the pain is that the page looks flat and no information is missing; the Feature form rejects annoyance. |
| Evidence strength | weak | One user, one shape, stated not observed; no sign-up or retention signal. |
| Value vs. inaction | weak | Doing nothing hides no data and breaks nothing; names and amounts already separate projects. |
| Feasibility / appetite | adequate | Option B is a credible medium build, and #66 has already worked out the shade steps. The cost is real but not the blocker. |
| Strategic fit | weak | Blurs the rule that color answers only "whose work is this?" (`principles.md`), and positioning does not rest on color. |
| Risk posture | adequate | Risks are known from #66: shades cap at four, the heatmap cannot take them, and the legend reopens #128. None is mitigated, but none is hidden. |

## Verdict & Rationale

Kill. The problem is cosmetic by Blake's own account, the evidence is one
user's impression, and every option that fixes it spends a structural change
(stats API, token generator, legend, a core color rule) on how one panel
looks. Doing nothing costs nothing measurable. This also answers issue #66:
it proposes the same change, and this assessment finds no problem behind it
that clears the Feature gate.

**Revisit if** a single-client user needs color to tell projects apart
(not just to make the page look less flat), or if a second user reports it.

A flat-looking home panel can still be filed as an `enhancement` against the
panel's design, with color out of bounds.
