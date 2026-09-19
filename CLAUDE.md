# Time Tracking — working notes

A time tracker for solo contractors. The product thesis is **restraint**; Toggl
is the comparison point and it does too much.

Read `docs/` before changing anything structural — `docs/CLAUDE.md` says how
those are written.

**This file holds what constrains code anywhere in the repo.** Before adding
to it, name the doc that owns the claim:

| The claim is | It goes to |
| --- | --- |
| How to run, build or deploy something | `docs/local-dev.md`, `docs/deploying.md`, `docs/setup.md` |
| About one screen or one app | that screen's doc, `docs/macos.md`, `docs/design/landing.html` |
| A shape a screen is assembled from | `docs/design/screens/components.html` |
| Enforced by a check or a config | that script or config, in a comment at the line someone edits |
| Unbuilt work, or something decided against | `docs/tasks.md`, `docs/design/principles.md` |
| True only under one path | `.claude/rules/<topic>.md`, with `paths:` frontmatter |

Only a claim no doc above owns belongs here, and then as one paragraph.
Proximity is not ownership: a related section already in this file is the
reason it keeps growing, not a precedent. Say what a thing is, not what it
was instead of.

**Under 200 lines**, which is Anthropic's target for a file loaded into every
session: past it, adherence drops and the rule you needed is the one that gets
lost. A section that is true only when editing one part of the tree belongs in
`.claude/rules/`, where it loads when Claude opens a matching file and costs
nothing the rest of the time.

## Non-negotiables

**One running timer per user, enforced by a database index.** Never add a code
path that could produce overlapping entries.

**The app never silently modifies user data.** Runaway timers are surfaced, not
auto-trimmed. Rates freeze onto invoices at generation. This is a billing
system — silent correction destroys trust in every number it reports.

**Server owns timer truth; clients own responsiveness.**

**The accent (green `#52FC43`) marks the running timer and the primary
confirm action** — the one action a screen or dialog exists to complete. Two
uses, and a screen gets one of the second kind at most.

**Green is the product's one colour, and it runs a scale.** `accent-default`
is the live thing and the button that acts; `success` is the same hue a step
down (`accent.500`), for an outcome that has already happened — paid, saved.
The step is what separates them: a paid badge must read as green without
reaching the weight of a running timer. Never white text on the accent — use
`--text-on-accent`. `docs/design/brand.html` is the test, and for focus rings
(neutral, never the accent).

**Content floats, chrome recedes — in four planes**, deepest to nearest:
`bg-surface-recessed`, `bg-surface-base`, `bg-surface-primary`,
`bg-surface-elevated`.

**Judge adjacent surfaces by OKLCH ΔL, never by WCAG contrast.** Changing
either ramp means changing `docs/design/deriving-colour.md`'s generators,
never a hex.

## Conventions

- **No Server Actions** for anything Expo or Swift also needs. Everything goes
  through `/api/v1/*` route handlers.
- Colors come from **semantic** tokens only; primitives stay in the token
  package.
- **Only clients have a colour**, resolved through `useProjectColors()`;
  internal work gets none. `projects.color` is a dead column awaiting its drop
  migration — nothing selects or writes it.
- Design tokens are **generated** — edit `packages/design-tokens/tokens.json`,
  then `pnpm tokens`. Never edit files in `dist/`.
- Both neutral ramps are **derived**: change a parameter in
  `src/derive-neutrals.mjs` (dark) or `src/derive-light.mjs` (light) and paste
  the output. A hand-edited hex fails `pnpm tokens:validate`, naming the step.
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@stint/core`) so
  a retried insert is idempotent — the same id lands on the same row.
- Rate resolution is written **twice** — `resolveRate()` in TS (the one that
  actually bills) and `resolve_rate()` in SQL. They must agree;
  `docs/data-model.md` has the chain.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Local development

**Never point local dev at production.** `pnpm dev` reads
`apps/web/.env.development.local`; `pnpm migrate` and `pnpm verify:schema`
read `.env.local` and reach the hosted project.

`docs/local-dev.md` has the rest: one sign-in at a time per browser and how a
failed magic link is diagnosed, why everything speaks `localhost` and never
`127.0.0.1`, and which services `dev:up` leaves out.

## Generated files and a fresh clone

`packages/design-tokens/dist/` is gitignored but two of its outputs are needed
to build, so `apps/web` has `prebuild` and `predev`. **Anything generated and
gitignored needs the same treatment**: assume the build machine has only what
git tracks.

## Dependency versions

**TypeScript stays on 6.x until Next declares TS 7 support.** 6 is the last
release built on the JavaScript codebase, so it keeps the programmatic API
that Next's type checking and TS plugin use; 7 ships without one until 7.1.
The config work is already done, so the move is a version bump.

**`@types/node` tracks the Node major actually in use** (24).

## Jurisdiction

**This product is built from a US point of view.** Default to USD, US date and
number formats, US banking rails (ACH routing + account number, checks), and
US tax framing (1099 contracting, W-9, no VAT). A US contractor invoicing
services usually has no tax line at all — `tax_rate` defaults to 0 and should
stay there unless a client genuinely owes tax. International support is
**additive, not the baseline**. Never infer a non-US jurisdiction from sample
data or a developer's current location.

## Docs

`docs/CLAUDE.md` says how docs are written and `/trim <path>` measures one
against it.

**`docs/tasks.md` is the only list of unbuilt work.** A finished task is
deleted, not ticked; something decided against moves to
`docs/design/principles.md`, where it will be read before being re-proposed.

**`docs/api.md` marks unimplemented endpoints `(not implemented)`.**

**The app is online-only**, for the reasons `docs/architecture.md` records.

**The mark's geometry is a token.** `brand.mark` in `tokens.json` generates
`--mark-bound-*` and `Tokens.Mark`, so `|Stint|` is one drawing across both
apps.
