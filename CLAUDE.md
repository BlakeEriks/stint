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

Only a claim no doc above owns belongs here, and then as one paragraph.
Proximity is not ownership: a related section already in this file is the
reason it keeps growing, not a precedent. Say what a thing is, not what it
was instead of.

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
  internal work gets none. `projects.color` is a dead column awaiting its drop
  migration — nothing selects or writes it.
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

## Migrations

`pnpm migrate` applies `supabase/migrations/`; `docs/setup.md` has the
connection and the flags.

**They are additive and forward-only.** Each file runs in its own
transaction, so one that *fails* rolls back clean. There is no down path for
one that *succeeds and is wrong* — and for a billing system that is the right
trade: a rollback that drops a column takes issued invoices with it. So write
migrations that cannot need reverting:

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

`verify:schema` checks the shape is correct, not that getting there was safe.
This one is a review rule.

**The publishable key is public by design** — it ships in the browser bundle,
so RLS is the only thing protecting the data. That makes `verify:schema` the
real security control: a table reaching production without RLS exposes every
user's rows, and nothing else in the stack notices.

`pnpm verify:schema` asserts seven tables with **RLS on**, at least one policy
each (RLS with no policies denies everything), the partial unique index for
the timer invariant, and the signup trigger. CI runs it in the `database` job
against the RLS database, so a migration creating a table without RLS fails
before it reaches a real project. It reads `SUPABASE_DB_URL` from
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

All routes live in `apps/web/src/app/api/v1/`.

**Every request shape comes from `@stint/schema`.** A route parses its body or
query against a schema the package exports; it never declares one inline. A
route validating something the package does not model means adding it to the
package, because the package is also what the browser's types derive from — an
inline copy drifts from the contract in silence, and Zod strips what it does
not name, so a field the schema forgets is a 200 that discards the value.

Shared plumbing in `apps/web/src/lib/`:

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
- `rows.ts` — the only snake_case↔camelCase boundary, invoices and line
  items included. Rename a column here and nowhere else.

  Each converter takes a row interface, and `columns<Row>()` ties that
  interface to the select list that fills it — a column the row does not
  declare and a field the list does not select both fail to compile. The list
  stays one string literal because supabase-js parses it to infer the row
  type; a `join()` over an array degrades every consumer to an error type.

- `validate.ts` — Zod parsing with 422 + `treeifyError` details.

The browser's types in `lib/client/api.ts` **derive** from `@stint/schema`
rather than copying it.

The wrapper is `Response<T>`, which makes every field required: a schema marks
a field `.optional()` to describe what a *request* may omit, but every
converter in `rows.ts` sets every field unconditionally, so a response never
omits one.

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

**CI splits by what a check needs**: `static` for everything that needs no
database, `database` for the route and RLS suites over a Postgres service
container built by `scripts/ci-db.sh`, `macos` for `swift build`, and `e2e`
for the browser. Root `pnpm test` is `pnpm -r test`, so it runs the core
package's suite too — filter to `@stint/web` for the route suite alone.

Node's `--experimental-strip-types` rejects **TypeScript parameter
properties** — write constructor fields explicitly in any code the tests load.

Zod 4 is used throughout: `z.uuid()`, `z.iso.datetime()`, `z.email()`,
`z.record(z.string(), z.unknown())`. Keep every workspace package on the same
Zod major, or `z.infer` degrades to `unknown` across package boundaries.

## Invoicing

Line-item construction lives in `packages/core/src/invoice.ts` — pure, so the
preview a user approves and the invoice that issues are built by identical
code. Routes in `apps/web/src/app/api/v1/invoices/`; shared loaders in
`apps/web/src/lib/invoicing.ts`, which reads rows through `rows.ts` like
everything else. `formatCurrency` and `formatHours` are in core for the same
reason: the preview and the PDF render one number one way.

**An invalid `tz` is rejected rather than swallowed here.** The period is local
dates, so the zone decides which entries are billed; the read endpoints fall
back to UTC, these two return 422. An omitted one still defaults to UTC.

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

`screens/components.html` is what a screen is assembled from — which
primitive to reach for, the conventions that repeat across screens, and the
shapes already duplicated. Read it before adding a component.

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

### Time is local wall-clock; the API is UTC

**Never step days or weeks with `+ 86_400_000`.** Use `startOfLocalDayOffset`:
a week containing a DST transition is 167 or 169 hours, so fixed-millisecond
arithmetic mis-buckets the entries at its edges. The inverse maths is
`packages/core/src/grid.ts`, and every function takes the column's real span
rather than 24 hours.

The same rule governs the entry dialog, whose inputs are local wall-clock:
`toInstant` corrects by the offset the guess lands in, so it is DST-correct at
the target instant.

### Queries

**Cache keys come from `lib/client/query-keys.ts`, never written inline**, so
one shape per query is what an invalidation can match. Anything that changes a
time entry calls `invalidateEntryData()` — summary, entries, stats, calendar
and activity all read those rows, and refreshing a subset makes two screens
disagree about the same work.

**A query renders through `Listing`**, which owns loading, failure and empty,
so no screen writes those branches.

### Invoices

**Preview and generation must agree.** Any change to what would be billed
clears the approved preview and hides Generate. Tested, and the test was
verified to fail when the invalidation is removed.

**An issued invoice locks an entry; a draft does not** — `guard_billed_entry`
returns early on a draft.
### The pre-commit hook

Husky runs `lint-staged`, which runs `biome check --write` over the **staged
files only** and re-stages what it fixed. Sub-second, because it never walks
the repo.

**Formatting and lint only** — a commit is not the moment to run a test suite.
It is a convenience, not the gate: `pnpm lint` in CI is, since a hook can be
skipped with `--no-verify` and does not exist on a fresh clone until
`pnpm install` runs `prepare`.
### End-to-end tests

`pnpm test:e2e` — Playwright against the local stack, and deliberately outside
`pnpm test`: a browser download must not become a prerequisite for the unit
suites. `docs/local-dev.md` has how to run them and the traps.

**No retries, in CI either.** A retry doubles the time before a real failure
is reported — a genuine failure is a 30s timeout, so two failures become four.
At ten tests and ~31s of work, a flaky test going red is the intent.

**They sign in for real**, through Mailpit, because sign-in is the flow most
worth covering and stubbing it would test the stub.

### UI tests

`pnpm test:ui` — Vitest + Testing Library in jsdom, `test/ui/*.test.tsx`.
Separate from `pnpm test` (route handlers against real Postgres under
`node --test`); the Vitest config never picks those up.

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
