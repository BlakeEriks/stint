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

**One running timer per user, enforced by a database index.** Not by API code.
`POST /timer/start` returns 409 when one is running. Never add a code path that
could produce overlapping entries.

**The app never silently modifies user data.** Runaway timers are surfaced, not
auto-trimmed. Rates freeze onto invoices at generation. This is a billing
system — silent correction destroys trust in every number it reports.

**Server owns timer truth; clients own responsiveness.** A running timer ticks
locally from `startedAt`, but the server decides whether it is running.

**The accent (green `#52FC43`) marks the live, primary thing on a screen, and
inside the app that is the running timer.** Green never means success —
success is cyan `#2CCCEB`. The test, and what it permits, is
`docs/design/brand.html`.

**Never white text on the accent** — 1.37:1. Use `--text-on-accent`. CI guards
this specific regression.

**Focus rings are neutral, never the accent.**

**Content floats, chrome recedes — in four planes**, deepest to nearest:
`bg-surface-recessed`, `bg-surface-base`, `bg-surface-primary`,
`bg-surface-elevated`. A card darker than the surface under it reads as a
hole.

**Judge adjacent surfaces by OKLCH ΔL, never by WCAG contrast** — WCAG is
compressive near black and reports a near-invisible pair as 1.03:1. Surfaces
come off a linear ladder, ink off an eased curve; changing either means
changing `deriving-colour.md`'s generators, never a hex.

## Conventions

- **No Server Actions** for anything Expo or Swift also needs. Everything goes
  through `/api/v1/*` route handlers.
- Colors come from **semantic** tokens only. Primitives stay in the token
  package. Never hardcode a hex in a component.
- **Only clients have a colour**, resolved through `useProjectColors()`.
  Internal work has no client, so it takes the neutral `INTERNAL_SWATCH` and
  stays legible beside the hues in a row or a graph. `projects.color` is a
  dead column awaiting its drop migration — nothing selects or writes it.
- Design tokens are **generated** — edit `packages/design-tokens/tokens.json`,
  then `pnpm tokens`. Never edit files in `dist/`.
- Both neutral ramps are **derived**: change a parameter in
  `src/derive-neutrals.mjs` (dark) or `src/derive-light.mjs` (light) and paste
  the output. `pnpm tokens:validate` re-derives both and diffs them, so a
  hand-edited hex fails CI naming the step. `src/oklch.mjs` has the OKLCH↔sRGB
  maths plus `rgbToOklch` for auditing a hex you did not generate.
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@stint/core`) so
  a retried insert is idempotent — the same id lands on the same row.
- Rate resolution is written **twice** — `resolveRate()` in TS (the one that
  actually bills) and `resolve_rate()` in SQL, which `resolve_entry_rate()`
  and both home-screen rollups call. `apps/web/test/rates.test.ts` asserts
  they agree across every combination of the four levels. See
  `docs/data-model.md`.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Local development

**Never point local dev at production.** `pnpm dev` talks to the local stack
because Next.js loads `apps/web/.env.development.local` ahead of `.env.local`
in development — while `pnpm migrate` and `pnpm verify:schema` read
`.env.local` and reach the hosted project.

`pnpm dev:reset` rebuilds from migrations plus `supabase/seed.sql`. Sign in as
`dev@localhost.test` and click the link in Mailpit (`:54324`); mail is captured
locally, never sent.

**One sign-in at a time per browser.** PKCE keeps its code verifier in
localStorage under one key per origin, so two tabs share it and the second
request overwrites the first's verifier. Two guards: `/signin` redirects home
when a session exists, and requesting a link calls
`signOut({ scope: 'local' })` — local only, so a laptop never revokes a
phone's session.

The symptom is a link that looks dead. A `303` from `/verify` means
verification worked; the missing **`/token` call** after it is the exchange
failing. `docs/local-dev.md` has the log filters.

Use `localhost` throughout, not `127.0.0.1`: they are different hosts to a
browser, so a session cookie set on one is invisible to the app served from
the other.

**`dev:up` excludes nine services on the command line, not in `config.toml`.**
The app's Supabase surface is `.from()`, one `.rpc()`, and auth, so the subset
runs in ~540MB where the full stack wants ~7GB. Studio is among the nine and
`[studio] enabled` is still `true`, so `:54323` refuses the connection rather
than explaining itself; `pnpm dev:up:studio` keeps it, and `psql` against
`:54322` needs no containers at all.

`-x` must be passed at START — on an already-running stack it is accepted and
does nothing, hence the `stop &&` in those scripts. Plain `stop` keeps the data
volumes; only `--no-backup` deletes them.

## Generated files and a fresh clone

`packages/design-tokens/dist/` is gitignored, and two of its outputs are
needed to build: `tokens.ts` (imported by `color-picker.tsx`) and
`tokens.css` (imported by `globals.css` by relative path), so a fresh clone
fails with "Can't resolve '@stint/design-tokens'". Hence `prebuild` and
`predev` in `apps/web`.

**Anything generated and gitignored needs the same treatment**: assume the
build machine has only what git tracks.

## Dependency versions

**TypeScript stays on 6.x until Next declares TS 7 support.** 6 is the last
release built on the JavaScript codebase, so it keeps the programmatic API
that Next's type checking and TS plugin use; 7 ships without one until 7.1.
The config work 7 needs is already done, so the move is a version bump.

**`@types/node` tracks the Node major actually in use** (24) — types for a
runtime you are not running is a silent trap.

**Dependabot ignores majors on purpose**; a toolchain major is a decision.
`dependabot.yml` says why.

## Triggers on `auth.users`

`create_default_settings` fires inside Supabase's **signup transaction**, so
anything it raises rolls the whole signup back and the client sees only
`unexpected_failure` / "Database error saving new user" with a 500 — the
useful error is swallowed by the Auth service.

It is `security definer` **with `set search_path = public, pg_temp`**. Both
halves matter: definer gives it the owner's privileges, and the pinned path
resolves `user_settings` regardless of the caller's own search path — the
caller is `supabase_auth_admin`, which does not have `public` on its path.
Any future definer function needs the same treatment, which is also the
standard hardening against a caller shadowing a table name.

## Jurisdiction

**This product is built from a US point of view.** Default to USD, US date and
number formats, US banking rails (ACH routing + account number, checks), and
US tax framing (1099 contracting, W-9, no VAT). A US contractor invoicing
services usually has no tax line at all — `tax_rate` defaults to 0 and should
stay there unless a client genuinely owes tax.

International support is **additive, not the baseline**: multi-currency is
modeled but unimplemented, and IBAN/SWIFT/PIX belong to a later payment-profile
feature rather than the default path. Never infer a non-US jurisdiction from
sample data or a developer's current location.

## Payment details

Bank details render on the **invoice PDF, never in an email body**, and
placement is not a user preference. Rendering identically on every invoice is
what makes a *change* visible, which is what fraud-prevention guidance tells
payers to challenge.

- `payment_profiles` is a named bundle of fields. **US-first**: account number
  + ACH routing is the default path; IBAN/SWIFT, a labelled national bank
  code, and intermediary-bank fields are additive and render only when set.
- One default per user, enforced by a partial unique index. The first profile
  created becomes the default automatically.
- Resolution mirrors rates: the client's `payment_profile_id`, else the user's
  default. A dangling reference falls back rather than rendering nothing.
- **Invoices freeze the rendered snapshot** into `payment_details` (JSONB) at
  generation, like rates. Editing a profile never alters an issued invoice.
- `buildPaymentDetails` in `@stint/core` drops unset fields entirely — never
  render an empty label, and never an empty section header.
- The PDF payment block is `wrap={false}`: a stranded "Payment" header with
  the account numbers overleaf is the one page break that actually harms the
  reader.

## Docs

`docs/CLAUDE.md` says how docs are written and `/trim <path>` measures one
against it.

**`docs/tasks.md` is the only list of unbuilt work.** A finished task is
deleted, not ticked; something decided against moves to
`docs/design/principles.md`, where it will be read before being re-proposed.

**`docs/api.md` marks unimplemented endpoints (not implemented)** — there are
none right now. Keep that honest.

**The app is online-only.** There is no outbox and no `POST /sync`;
`docs/architecture.md` records why a sync engine would not be the answer if
offline ever comes back.

**The mark's geometry is a token.** `brand.mark` in `tokens.json` generates
`--mark-bound-*` and `Tokens.Mark`, so `|Stint|` is one drawing across both
apps.

## The pre-commit hook

Husky runs `lint-staged`, which runs `biome check --write` over the **staged
files only** and re-stages what it fixed. Sub-second, because it never walks
the repo.

**Formatting and lint only** — a commit is not the moment to run a test suite.
It is a convenience, not the gate: `pnpm lint` in CI is, since a hook can be
skipped with `--no-verify` and does not exist on a fresh clone until
`pnpm install` runs `prepare`.
