# Time Tracking — working notes

Time tracking and invoicing for one contractor. Tracking is free; the invoice
is what gets paid for. **`docs/positioning.md` owns the thesis, the
competitors and the price** — this file and every other doc defer to it.

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
| Who this is for, what it competes with, what it costs | `docs/positioning.md` |
| What we believe about the product | `docs/design/principles.md` |
| Unbuilt work | `docs/roadmap.md` |
| A known fault | `docs/defects.md` |
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

**The app never silently modifies user data.** A suspect record is surfaced
for the user to resolve, never corrected on their behalf
(`docs/design/principles.md`).

**Server owns timer truth; clients own responsiveness.**

**The accent (green `#52FC43`) marks the running timer and the primary
confirm action** — the one action a screen or dialog exists to complete. Two
uses, and a screen gets one of the second kind at most.

**Green is the product's one colour, and it runs a scale.** `accent-default`
is the live thing and the button that acts; `success` is the same hue one step
off it — toward the ground in dark, toward the paper in light — for an outcome
that has already happened: paid, saved. The step is what separates them: a
paid badge must read as green without reaching the weight of a running timer.
Never white text on the accent — use `--text-on-accent`.
`docs/design/deriving-colour.md` has the step; `docs/design/brand.html` is the
test, and for focus rings (neutral, never the accent).

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
  internal work gets none.
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
read `.env.local` and reach the hosted project — which is why **neither is
run by hand against production**. A merge deploys: Vercel holds the build
unaliased until `release.yml` migrates and verifies it
(`docs/deploying.md`).

**A new worktree is made with `pnpm worktree <branch>`**, never
`git worktree add`. Git carries no `node_modules`, no
`packages/design-tokens/dist` and no `.env.development.local`, so a
hand-made worktree cannot run the app or resolve `@stint/design-tokens` —
and a change verified only against jsdom is a change nobody has seen. The
script does those three; `--from <ref>` branches off something other than
main.

`docs/local-dev.md` has the rest: one sign-in at a time per browser and how a
failed magic link is diagnosed, why everything speaks `localhost` and never
`127.0.0.1`, and which services `dev:up` leaves out.

## Generated files and a fresh clone

`packages/design-tokens/dist/` is gitignored but two of its outputs are needed
to build, so `apps/web` has `prebuild`, `predev`, `pretest` and `pretest:ui`.
**Anything generated and gitignored needs the same treatment**: assume the
build machine has only what git tracks. A suite is not exempt — the PDF route
imports `dist/tokens.ts` and the UI suite resolves `@stint/design-tokens`, so
both fail on a clone that has never built.

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

**`docs/roadmap.md` is the only list of unbuilt work**, and it carries the
gate that work passes to get there. Known faults go to `docs/defects.md`.

**A branch that decides something gets `/dissent` before it merges** — a
price, a thesis, a scope cut, a milestone order. It argues against the branch
with agents that did not write it, because a claim and the evidence refuting
it can sit four lines apart and never collide for whoever wrote both.

**`docs/api.md` marks unimplemented endpoints `(not implemented)`.**

**The app is online-only**, for the reasons `docs/architecture.md` records.

**The mark's geometry is a token.** `brand.mark` in `tokens.json` generates
`--mark-bound-*` and `Tokens.Mark`, so `|Stint|` is one drawing across both
apps.
