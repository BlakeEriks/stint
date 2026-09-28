# Concept: Projects get shades of their client's color

- **Slug**: project-shades
- **Created**: 2026-09-28
- **Recommended option**: none (Option A, do nothing)

## Options

### Option A — Do nothing
- **Sketch**: The single-client home page stays one color. Names and amounts already say which project the time went to.
- **Appetite**: none
- **Trade-offs**: Keeps color's one meaning ("whose work is this?") and costs nothing. The panel still looks flat to a single-client user, which is the whole stated pain.
- **Rabbit holes**: none

### Option B — Automatic shades on the home panel only
- **Sketch**: On the week's bars and the month's strip, a client's segment splits into its projects, each drawn in a lighter or darker step of the client's color, assigned automatically. The heatmap, legend, and every other surface are unchanged. Nothing is stored and nothing is picked.
- **Appetite**: medium (weeks)
- **Trade-offs**: Answers the flatness where it is seen. Needs the stats endpoint to break totals down by project, a shade generator in the token package, and both themes checked. It puts a second meaning on color in one panel only, and the legend still shows one swatch per client, so shades on screen have no key.
- **Rabbit holes**: A client with more than four projects repeats shades. Adjacent steps may not separate at the strip's thickness in light theme. The legend will be asked to list projects, which reopens #128.

### Option C — Issue #66 as written
- **Sketch**: Each project stores a shade step, picked in the project form. Shades reach the week's bars, the month's strip, and every surface that colors a project. The heatmap stays per client. `CLAUDE.md` changes to "a client owns a hue; a project may take a step on it".
- **Appetite**: large (a month or more)
- **Trade-offs**: A complete, consistent answer across web and macOS. It retypes a column, adds a picker, a token generator, a stats API change, a legend redesign, and macOS parity, all to fix how one panel looks.
- **Rabbit holes**: The token generator (#66 calls it the long pole), the legend, macOS parity, and the heatmap staying per client while the rest of the panel goes per project.

## Recommendation

**Do not proceed.** Blake confirmed the pain is that the page looks flat, and
that no information is missing. Every option that fixes it spends a
structural change (API, tokens, legend, a core design rule) on an aesthetic
problem, and each one blurs the rule that color answers only "whose work is
this?". The Feature form's gate rejects annoyance, and nothing shows a
contractor signs up or leaves over it.

If flatness keeps bothering Blake, file it as an `enhancement` against the
home panel's design, with color out of bounds, and let that issue find a
non-color answer.

## Out of Scope (for the recommended option)

- Any change to project or client color.
- Issue #66's column, generator, and picker.

## Assumptions to Validate

- A single-client user never needs color to tell projects apart. Blake said so for himself; no second user has said otherwise.
- The flatness is cosmetic and costs no sign-ups or retention.
