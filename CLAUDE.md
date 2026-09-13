# Time Tracking — working notes

A time tracker for solo contractors. The product thesis is **restraint**; Toggl
is the comparison point and it does too much.

Read `docs/` before changing anything structural — `docs/CLAUDE.md` says how
those are written.

**This file holds what constrains code anywhere in the repo.** A rule about
one screen belongs in that screen's doc; a rule the build enforces belongs in
the build. Say what a thing is, not what it was instead of.

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
- **Only clients have a colour**, resolved through `useProjectColors()`;
  internal work gets none. `projects.color` is a dead column — nothing reads
  or writes it.
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
- Rate resolution is written **three times** — `resolveRate()` in TS (the one
  that actually bills), `resolve_entry_rate()` in SQL (a reference
  implementation with no callers), and the inline coalesce in
  `unbilled_by_client` (the home card). Keep all three identical; nothing
  checks that they are. See `docs/data-model.md`.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Local development

**Never point local dev at production.** `pnpm dev` talks to the local stack
because Next.js loads `apps/web/.env.development.local` ahead of `.env.local`
in development — while `pnpm migrate` and `pnpm verify:schema` read
`.env.local` and reach the hosted project.

`pnpm dev:reset` rebuilds from migrations plus `supabase/seed.sql`. Sign in as
`dev@localhost.test` and click the link in Mailpit (`:54324`); mail is captured
locally, never sent. Studio is on `:54323`.

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

`realtime`, `storage`, `edge_runtime` and `analytics` are off — the app's
Supabase surface is `.from()`, one `.rpc()`, and auth. The subset runs in
~540MB where the full stack wants ~7GB.

**Studio is off, and `config.toml` does not say so** — `[studio] enabled` is
`true` while the container is simply not started, so `:54323` refuses the
connection. `pnpm dev:up:studio` brings it up; `psql` against `:54322` needs
no containers at all.

`-x` must be passed at START — on an already-running stack it is accepted and
does nothing, hence the `stop &&` in that script. Plain `stop` keeps the data
volumes; only `--no-backup` deletes them.

## Migrations

`pnpm migrate` applies `supabase/migrations/` over a plain Postgres
connection. Each file runs in its own transaction and applied versions are
recorded in `schema_migrations`, so re-running is a no-op and a new migration
applies alone. `--dry-run` shows the plan; `--url` overrides the connection.

**The publishable key is public by design** — it ships in the browser bundle,
so RLS is the only thing protecting the data. That makes `verify:schema` the
real security control: a table reaching production without RLS exposes every
user's rows, and nothing else in the stack notices.

`pnpm verify:schema` asserts seven tables with **RLS on**, at least one policy
each (RLS with no policies denies everything), the partial unique index for
the timer invariant, and the signup trigger. Exits non-zero, so it belongs in
CI once a staging database exists. It reads `SUPABASE_DB_URL` from
`apps/web/.env.local` — a secret that bypasses RLS and is never used by the
app itself.

To test a migration locally without touching a real project, start a
throwaway Postgres (`/opt/homebrew/opt/postgresql@14/bin`) on a spare port
over TCP — the socket path in the scratchpad exceeds the 103-byte limit —
stub `auth.users` and `auth.uid()`, then point `pnpm migrate --url` at it.

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

## Migrations are additive, and forward-only

`migrate.mjs` records versions and wraps each file in a transaction, so a
migration that **fails** rolls back clean. There is no down path for one that
**succeeds and is wrong** — and for a billing system that is the right trade:
a rollback that drops a column takes issued invoices with it.

So the rule is to write migrations that cannot need reverting:

- **Add, never destroy.** New columns are nullable or defaulted. Do not drop
  or rename a column that has shipped, and do not narrow a type.
- **Retiring a column is two releases.** Stop writing it, ship, confirm
  nothing reads it, then drop it in a later migration — never in the same one
  that changes the code.
- **A destructive change to unreleased schema is fine.** Before anything is
  live, fold the correction into the original file rather than stacking a
  fix-up on top.
- Backfills belong in their own migration, separate from the DDL, so a slow
  one cannot hold a lock on the change that needs to land.

CI cannot enforce this — `verify:schema` checks the shape is correct, not
that getting there was safe. It is a review rule.

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

## API layer

All routes live in `apps/web/src/app/api/v1/`. Shared plumbing in
`apps/web/src/lib/`:

- `auth.ts` — `requireSession()` accepts both a bearer token (Expo, macOS) and
  a cookie session (web); both yield an RLS-scoped client.

  **`getClaims()` must be passed the token explicitly on the bearer path.** It
  reads the *stored session*, not the `Authorization` header `bearerClient`
  sets via `global.headers`. With no stored session it returns
  `{ data: null, error: null }` — no error, no claims, and every bearer
  request 401s. The route tests inject `__TEST_DB__` and never exercise this
  path, so only a real token against a real server catches it.
- `errors.ts` — `handle()` wraps every route; `ApiError` maps to documented
  status codes. Contains a compile-time guard asserting the local `Code` union
  matches `ErrorCode` in `@stint/schema`.
- `rows.ts` — the snake_case↔camelCase boundary for entries, clients,
  projects, settings and payment profiles. Rename one of those columns here
  and nowhere else.

  **Invoices are the exception.** `invoicing.ts` carries its own `toInvoice`
  and `toLineItem` plus a `ClientRow` interface, because the PDF loader needs
  shapes `rows.ts` does not model. `toLineItem` takes `Record<string, any>`,
  so nothing type-checks it against the schema. **A change to invoice or
  line-item fields means editing both files.**

The browser's types in `lib/client/api.ts` **derive** from `@stint/schema`
rather than copying it.

The wrapper is `Response<T>`, which makes every field required: a schema marks
a field `.optional()` to describe what a *request* may omit, but every
converter in `rows.ts` sets every field unconditionally, so a response never
omits one.
- `validate.ts` — Zod parsing with 422 + `treeifyError` details.

### Conventions

- Never pre-check the running timer before inserting. Attempt the insert and
  translate the unique-violation — a pre-check is a race, the index is not.
- Numeric columns arrive from PostgREST as **strings**; `rows.ts` converts them.
  Never pass them straight through.
- Offline replays: a duplicate-key insert with a client-supplied id returns the
  existing row with 200, not an error.
- `nextInvoiceNumber` is not client-settable — gapless numbering depends on
  `allocate_invoice_number()` holding the row lock.

### Testing

`apps/web/test/routes.test.ts` runs the **real** handlers against a **real**
Postgres with the real migrations. `requireSession` has a `__TEST_DB__` seam;
`test/shim.mjs` is a supabase-js-shaped builder over node-postgres, and
`test/loader.mjs` resolves `next/*` and the `@/` alias for `node --test`.

Node's `--experimental-strip-types` rejects **TypeScript parameter
properties** — write constructor fields explicitly in any code the tests load.

Zod 4 is used throughout: `z.uuid()`, `z.iso.datetime()`, `z.email()`,
`z.record(z.string(), z.unknown())`. Keep every workspace package on the same
Zod major, or `z.infer` degrades to `unknown` across package boundaries.

## Invoicing

Line-item construction lives in `packages/core/src/invoice.ts` — pure, so the
preview a user approves and the invoice that issues are built by identical
code. Routes in `apps/web/src/app/api/v1/invoices/`; shared loaders in
`apps/web/src/lib/invoicing.ts`.

### Rules that must not regress

- **The rate is always part of the grouping key.** Two entries with the same
  task name but different rates must never merge — the line would misstate
  what the client is charged.
- **Amounts round once, per line, from summed seconds.** Rounding per entry
  then summing drifts (3 × 20min would give 99.99 instead of 100.00).
- **Line items are frozen at generation.** Never recompute a PDF from time
  entries; re-downloading a year later must produce the same document.
- **Only drafts can be sent or deleted.** Sending is an action, not a status
  write — the status change happens after delivery succeeds.
- **Voiding releases entries; it does not remove the number.** Numbering stays
  gapless.
- Running timers, non-billable entries, and already-invoiced entries never
  reach an invoice.

### No email

**The app sends no mail.** Invoices are downloaded and sent by the user from
their own address; `PATCH /invoices/:id/status` records that it went out.
`principles.md` says why, and it is not a gap to fill.

### PDF and the test runner

JSX lives only in `invoice-pdf.tsx`; routes import `renderInvoicePdf`
**dynamically** so the handlers stay loadable by the type-stripping test
runner. `test/loader.mjs` transforms `.tsx` through the SWC binary Next ships.

Route tests run with `--test-concurrency=1`: the test files share one database
and truncate tables in `beforeEach`, so parallel files clobber each other.

### RLS

`pnpm test:rls` is a **separate script against a separate database**, because
the route tests disable RLS on theirs. It connects as a non-superuser
`authenticated` role and sets `request.jwt.claim.sub` per transaction the way
PostgREST does, so `auth.uid()` resolves and the policies actually run.

Its `before` hook asserts the role is neither a superuser nor `BYPASSRLS` —
without that, every assertion would pass vacuously and the suite would be
decorative. Do not add `rls.test.ts` to the `test` glob: pointed at the
RLS-disabled database it would pass while proving nothing.

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

## The macOS menu bar app

`apps/macos` is a **SwiftPM executable, not an Xcode project** — it builds and
runs with the Command Line Tools alone (`swift build`), which is what makes it
verifiable from a terminal. `./bundle.sh` wraps the binary in a `.app` with
`LSUIElement`, because AppKit honours "menu bar only, no Dock icon" from a
bundle's Info.plist and not from a bare executable. Unsigned: distribution
needs a Developer ID and notarisation.

**It is the timer and nothing else** — start, stop, task name, project.
`menubar.html` is the spec.

### Sign-in

**An emailed six-digit code, typed into the panel**, verified in-process
against GoTrue's `/verify` with `type: "email"` and the digits in the `token`
field — `"magiclink"` is the type for the hashed token in a link and rejects a
typed code. The request sends no `redirect_to`.

GoTrue generates a code for every magic link whether the email shows it or
not; `supabase/templates/magic_link.html` puts it in front of the user via
`{{ .Token }}`.

`create_user` must be a real bool in an `Encodable` struct — a
`[String: String]` literal sends it quoted and GoTrue answers "cannot
unmarshal string into Go struct field OtpParams.create_user of type bool".

`supabase-swift` is not a dependency; two POSTs do not need an SDK.

**The session lives in the Keychain**, not `UserDefaults` — a refresh token is
a long-lived credential and a plist in the container is readable by anything
running as the user. `jwt_expiry` is an hour with rotation on, so refresh is
mandatory. One in-flight refresh is shared: two pollers racing would each
spend a rotating token and one would lose.

### The panel

- **Local tick, reconcile at 60s**, skew-corrected from `serverTime`. Today's
  total adds live seconds **from the fetch**, not from `startedAt` — the route
  already folded the running entry in.
- **A 409 from `/timer/start` refreshes rather than reports.** Another device
  won the race and the invariant held, so showing what *is* running is more
  use than the error.
- **The task field follows the server only when unfocused**, so it never
  overwrites itself mid-type.
- **Colours come from `Tokens.swift`, written by `pnpm tokens`** into the
  app's own sources, because SwiftPM cannot read the gitignored `dist/`. The
  Swift names keep the raw prefixes — `borderSubtle`, not `edgeSubtle`.
- **The runaway notice surfaces and stops there.** Adjusting needs a date and
  two times, which this panel has no room for.

**The API models are hand-written and nothing type-checks them against
`packages/schema`**, so a renamed field fails at runtime in Swift and nowhere
else. `architecture.md` wants an OpenAPI spec from the Zod schemas for exactly
this.

## Docs

`docs/CLAUDE.md` says how docs are written and `/trim <path>` measures one
against it. The rule that matters most: a sentence earns its place only if the
page cannot show it and CI cannot enforce it.

**`docs/tasks.md` is the only list of unbuilt work.** A finished task is
deleted, not ticked; something decided against moves to
`docs/design/principles.md`, where it will be read before being re-proposed.

**`docs/api.md` marks unimplemented endpoints (not implemented)** — there are
none right now. Keep that honest.

**The app is online-only.** There is no outbox and no `POST /sync`;
`docs/architecture.md` records why a sync engine would not be the answer if
offline ever comes back.

**`screens/_mockup.css` is generated by `pnpm tokens` and committed**, for the
same reason `Tokens.swift` is: a browser opening a file from disk cannot reach
the gitignored `dist/`. Never hand-copy a palette into a doc's own `:root`.

**The mark's geometry is a token.** `brand.mark` in `tokens.json` generates
`--mark-bound-*` and `Tokens.Mark`, so `|Stint|` is one drawing across both
apps.

## Two sites, one deployment

The marketing page and the product are split by **hostname**, decided in
`apps/web/src/proxy.ts` — `proxy.ts`, not `middleware.ts`, because the
middleware convention is deprecated in Next 16 and renamed.

    trackwithstint.com      -> app/landing/page.tsx   (rewritten, not redirected)
    app.trackwithstint.com  -> app/(app)/**

**The app lives at the root of its own origin, so its URLs carry no segment.**
`/invoices/…`, never `/app/invoices/…`.

The apex `/` is **rewritten**, so the visitor keeps the bare domain in the
address bar and the first impression costs no extra round trip. Any other apex
path **redirects** to the subdomain, so an old link still arrives.

Consequences worth knowing:

- **The landing page is fully static.** The session cookie belongs to the app
  subdomain, so the pitch never reads one and never renders per-request — do
  not add a session check to it.
- **Cross-origin links are plain `<a>`, not `next/link`.** `next/link` would
  try to route a subdomain jump client-side within the current origin. The CTA
  and the Sign in link both point at `NEXT_PUBLIC_APP_ORIGIN`.
- **Locally, bare `localhost` is the app**, so `pnpm dev` is unchanged. Any
  other `*.localhost` is the apex — `http://stint.localhost:3100` previews the
  landing page with no hosts-file entry, because browsers resolve every
  `*.localhost` name on their own.
- `isAppHost()` treats `*.vercel.app` as the app, so a preview deployment lands
  somewhere useful rather than on the pitch.

### The landing page

`app/landing/page.tsx`. The full specification — strategy, verbatim copy, the
banned-words list and the build notes — is `docs/design/landing.html`, written
in the app's own design system so it doubles as the visual reference. Two rules
the page must keep:

**The accent appears on exactly two objects: the hero timer and the CTA.** They
are the same fact (start tracking / time accruing), which is what the scarcity
rule permits. Nothing else on the page is green — the unbilled card, the
invoice and every heading are neutral.

### The hero is the scope

Three ticked lines for what it does, four struck lines for what it refuses,
then the price. `landing.html` carries the verbatim copy, the banned words and
the build rules.

**The struck items are muted and struck, never red.** Red is the danger
channel, and a stack of red marks reads as "this product is broken" for the
half-second before it parses.

## Web UI

Tailwind 4. Semantic tokens are registered in `@theme` by the token
generator, so `bg-surface-base`, `text-muted`, `border-edge-subtle`,
`text-on-accent` are real utilities and a hardcoded hex has nothing to hide
behind.

**Two things that bite here:**

1. **Tailwind parses `text-`/`bg-`/`border-` as the utility prefix**, so a
   token named `text-muted` must register as `--color-muted` or no utility is
   generated. The generator strips those prefixes: `bg-*` → `surface-*`,
   `border-*` → `edge-*`, `text-*` → bare. Check `dist/tokens.css` for the
   real names rather than guessing from the token file.
2. **`@theme inline` resolves `var()` at its own position**, so it is emitted
   last, after the light/dark blocks. Moving it earlier silently freezes every
   utility to the light palette.

The app is dark-first: `prefers-color-scheme: light` only applies under an
explicit `[data-theme="light"]`, so an un-stamped viewer gets the dark theme
the palette was derived for.

Import the token CSS by **relative path**, not the package export — Tailwind
does not follow package specifiers when collecting `@theme` values.

### Typography comes from the scale

**A component names a role (`type-amount`), never assembles one
(`font-mono text-[15px]`).** Each role in `tokens.json` under `type.scale`
generates a Tailwind `@utility` carrying family, size, weight, tracking, case
and tabular-nums together, so half a role cannot be applied. Colour stays
separate: a role says how text is set, not what it means.

Need something the scale lacks? Add a role, with a reason — `pnpm check:type`
runs in CI and rejects anything off it. A typo'd role compiles to **no CSS, no
warning, exit 0**, which is why it is a check rather than a convention.

`docs/design/brand.html` has the roles and what each is for.

### Layout

Header, rail, content column, dock, timer bar — `screens/frame.html` shows the
three arrangements and what changes at each breakpoint, plus the account menu
and the error boundaries.

Two things that govern code rather than this frame:

**`(app)/error.tsx` is nested inside the group on purpose**, so a failing
screen replaces the content column and the running timer keeps counting. Do
not move it to the root; `e2e/error-boundary.spec.ts` fails if you do.

**`Page` owns the content column**, so no screen sets its own width.

### Components

`components/ui/` is **vendored shadcn**, rewritten to our tokens at install by
`apps/web/scripts/shadcn-detox.mjs`. shadcn's palette names are not defined in
`@theme`: two collide with ours and mean the opposite — its `bg-primary` is
the action colour (ours is neutral grey), its `bg-accent` is hover grey (ours
is the neon green).

To add one: `pnpm dlx shadcn@latest add <name>`, then
`node scripts/shadcn-detox.mjs 'src/components/ui/<name>.tsx'`, then read the
diff. Add any unmapped name to `MAP` rather than hand-editing the file.

**`pnpm detox` in CI is the only enforcement.** Tailwind 4 drops an unknown
utility with no warning and exit 0, so a surviving `bg-primary` renders our
grey on a primary button and the build still passes.

The converter also rewrites what the check cannot see: `bg-black/50` →
`bg-overlay`, `shadow-lg`/`shadow-md` → our elevation tokens, and a floating
panel's `bg-background` → `bg-surface-elevated` (shadcn means "the app
surface"; ours is the recessed ground, so a dialog left on it would sit
*below* the page it floats over).

It is **one pass over an alternation**, not sequential `replaceAll` —
cascading turned `bg-primary` into `bg-surface-hover-default` when a later
rule matched its own output.

Radix supplies dialog/dropdown/popover behaviour: arrow keys, typeahead,
roving tabindex and focus-return.

### Projects

`screens/projects.html` covers `/projects`, the Projects section on a client,
and the entry dialog.

**`isBillableDefault` is the user's own answer**; infer nothing from
`client_id = null`, which covers genuinely internal, not-yet-assigned and
speculative work alike.

### The home screen

`screens/home.html` specifies the cards and the inbox.

**`unbilled_by_client` groups by (client, rate)**, and its coalesce chain must
stay identical to `resolve_entry_rate`, or the home screen and an invoice
preview disagree about the same work. The seed reproduces the case
deliberately.

`activity-strip.tsx` and `nav-timer.tsx` are **parked** — unimported, kept for
one release. `tasks.md` carries their removal.

### Invoices

`screens/invoices.html` specifies the list and the preview-then-generate flow.

**Preview and generation must agree.** Any change to what would be billed
clears the approved preview and hides Generate. Tested, and the test was
verified to fail when the invalidation is removed.

**A draft is deleted; an issued invoice is voided** — that is what keeps
numbering gapless.

### The timer bar

`screens/timer-bar.html` specifies its four states.

`useTimer` counts locally from `startedAt` and reconciles with `/summary`
every 60s and on focus; `serverTime` corrects a skewed device clock.

### Editing an entry

`entry-dialog.tsx` is the only place a logged entry is created, corrected or
deleted; `screens/projects.html` specifies it.

**The inputs are local wall-clock; the API is UTC.** `toInstant` corrects by
the offset the guess lands in, so it is DST-correct at the target instant.
Never do fixed-millisecond arithmetic here.

**An issued invoice locks an entry; a draft does not** — `guard_billed_entry`
returns early on a draft.

### The calendar

`screens/calendar.html` specifies the grid and its gestures.

**Never step days or weeks with `+ 86_400_000`.** Use
`startOfLocalDayOffset`: a week containing a DST transition is 167 or 169
hours, so fixed-millisecond arithmetic mis-buckets the entries at its edges.
The inverse maths is `packages/core/src/grid.ts`, and every function takes the
column's real span rather than 24 hours.

### Forms save themselves

Settings has **no save button**: `useAutosave` debounces to the server and
each card carries a `SaveIndicator` (dot at rest → spinner → check). A check
that is always present says nothing, so it appears only after a save the user
caused.

Two invariants the tests pin down: `pending` is set on the *edit*, not on the
request, so a field is never shown as saved while it holds unsent text; and
an edit during an in-flight request is **queued, not raced**, or a slow first
response can land after a newer one and the server keeps the older value.

`alive.current` is set on mount, not only cleared on unmount — StrictMode
double-mounts in dev, and a ref that is only ever cleared leaves every save
completing silently with the spinner stuck forever.

### The pre-commit hook

Husky runs `lint-staged`, which runs `biome check --write` over the **staged
files only** and re-stages what it fixed. Sub-second, because it never walks
the repo.

**Formatting and lint only** — a commit is not the moment to run a test suite.
It is a convenience, not the gate: `pnpm lint` in CI is, since a hook can be
skipped with `--no-verify` and does not exist on a fresh clone until
`pnpm install` runs `prepare`.

### End-to-end tests

`pnpm test:e2e` — Playwright against the **local Supabase stack**, which must
already be running (`pnpm dev:up` plus `pnpm dev`). Deliberately outside
`pnpm test`: a browser download must not become a prerequisite for the unit
suites.

**No retries, in CI either.** A retry doubles the time before a real failure
is reported — a genuine failure is a 30s timeout, so two failures become four.
At ten tests and ~31s of work, a flaky test going red is the intent.

**CI starts the stack with `-x studio,postgres-meta`** — 2.25GB of the 4.4GB
of images, for a dashboard the browser suite never drives. `pnpm dev:up` keeps
them; this is a CI-only narrowing.

The images are pulled rather than cached. `ci.yml` carries the measurements
and the warning against reintroducing a cache, at the step where someone would
add one.

**They sign in for real**, through Mailpit, because sign-in is the flow most
worth covering and stubbing it would test the stub. `e2e/mailpit.ts` reads the
**text** part of the email — the HTML `href` escapes its separators as
`&amp;`, and following that string literally makes GoTrue read `amp;type`
instead of `type`, a 400 that looks exactly like an expired link.

Three things that will bite again:

- **`auth.email.max_frequency` is `1s` and is already its minimum**, so two
  sign-ins inside the same second collide with "you can only request this
  after 0 seconds". `requestLink()` retries around it. The hourly `email_sent`
  cap is raised to 100 locally — the default 2 exhausts within one test run,
  and every further sign-in then fails in a way that reads as a broken link.
- **Next renders an always-present empty `role="alert"`** (the route
  announcer), so an unscoped `getByRole('alert')` is ambiguous. Scope to
  `main` or to the form.
- **A test that writes must restore the seed.** `resetSeed()` runs
  `supabase db reset` in `beforeAll`. Ordering within a file matters: the
  mutating test goes last.

### UI tests

`pnpm test:ui` — Vitest + Testing Library in jsdom, `test/ui/*.test.tsx`.
Separate from `pnpm test` (route handlers against real Postgres under
`node --test`); the Vitest config never picks those up.

jsdom lacks the APIs Radix's popper needs, so `test/ui/setup.ts` shims
`ResizeObserver`, `DOMRect` and the pointer-capture methods. Without them
every DropdownMenu test throws on open.

`userEvent.setup()` returns the instance synchronously — it is not a promise.

`test/ui/appearance.test.tsx` covers the design rules that fail **silently**:
white-on-accent, the accent on a stopped or runaway timer, an accent focus
ring, hand-rolled type instead of a role, and a `type-*` that is not a real
role. Verify each new assertion fails when its rule is broken.

**Do not add computed-style assertions.** jsdom cannot parse Tailwind 4's
compiled output (`@layer`, `@property`, `oklch()`, nested `@media`) and
silently drops what it does not understand, so `getComputedStyle` returns
browser defaults — 16px, black — for every one of our utilities. Injecting the
real `.next` CSS does not resolve it either. Real pixels need a browser.

These tests assert *rules*, not class strings — `toHaveClass('type-nav')` on
its own is a change detector.
