# Time Tracking — working notes

A time tracker for solo contractors. The product thesis is **restraint**; Toggl
is the comparison point and it does too much.

Read `docs/` before changing anything structural. The rationale for each
deliberate choice — and what was rejected — lives inline in the spec it
belongs to, so it is read alongside the thing it constrains.

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
inside the app that is the running timer.** Not navigation, not secondary
buttons, not links, never decoration. Green never means success — success is
cyan `#2CCCEB`.

**The constraint is on meanings, not instances.** Green may appear as many
times as that one idea genuinely occurs. The test: could a user say in one
short phrase what green means on this screen, and would it be true of every
green thing in view? If it takes two phrases, one of them loses the accent.
So the nav readout and the hero timer are both green (same fact, shown twice —
fine), and the landing page's three ticks plus its CTA are green (all of them
"what Stint does for you" — also fine), while a green link beside a green
timer is not.

This replaces an earlier "at most one accent element in view" rule, which was
too strict and misdiagnosed its own example: Toggl's magenta fails because it
marks nav, buttons, links and brand at once, not because there is a lot of it.
Spotify's green is on play, shuffle, saved, download and now-playing
simultaneously and stays legible, because all of them mean *yours / active*.
The app remains sparse in practice — there is usually only one live primary
thing — but that is an outcome, not a quota. See `docs/design/color.md`.

**Never white text on the accent** — 1.37:1. Use `--text-on-accent`. CI guards
this specific regression.

**Focus rings are neutral, never the accent.** `border-focus` is `n-700`. A
focus ring is constant and involuntary; spending the accent there drowns the
one signal it exists for.

**Content floats, chrome recedes — in four planes.** Depth increases toward
what is being read: header and timer bar on `bg-surface-recessed`, nav rail
and dock on `bg-surface-base`, the content column on `bg-surface-primary`,
cards on `bg-surface-elevated` with `shadow-card`. Never invert this — a card
darker than the surface under it reads as a hole.

Depth comes from surface colour **and** shadow. It previously came from shadow
alone, because `bg-base`→`bg-primary` was ΔL 0.0046 and the app read flat as a
result. **Judge adjacent surfaces by OKLCH ΔL, never by WCAG contrast** — WCAG
is compressive near black and reported that near-invisible pair as 1.03:1,
which is what made it look acceptable.

**The frame rises toward the card in both themes.** The nearest plane is the
lightest either way: a near-black card on a blacker frame, or a white card on
a grey one. Light is not the mirror of dark — only the ink inverts, darkening
to gain contrast where dark ink brightens.

Surfaces come off a linear ladder (`surfaces()`), ink off an eased curve
(`inkRamp()`), because the two want opposite things: surfaces are compared to
each other and want even spacing, ink is compared to the card behind it and
wants resolution where the contrast ratios are. See `docs/design/color.md`.

## Conventions

- **No Server Actions** for anything Expo or Swift also needs. Everything goes
  through `/api/v1/*` route handlers.
- Colors come from **semantic** tokens only. Primitives stay in the token
  package. Never hardcode a hex in a component.
- **Only clients have a colour.** A project is a subdivision of a client that
  is already identified, so colour answers *whose work is this?* and the name
  answers *which piece?*. `useProjectColors()` resolves project -> client ->
  colour; internal work gets none. `projects.color` still exists in the
  database but nothing reads it — see `docs/design/color.md` for why
  per-project variants were rejected.
- Design tokens are **generated** — edit `packages/design-tokens/tokens.json`,
  then `pnpm tokens`. Never edit files in `dist/`.
- Both neutral ramps are **derived**, not hand-picked: change a parameter in
  `src/derive-neutrals.mjs` (dark) or `src/derive-light.mjs` (light) and paste
  the output. Never eyedrop a grey — `pnpm tokens:validate` re-runs both
  generators and diffs them against `tokens.json`, so a hand-edited hex fails
  CI naming the step. That check exists because ratios prove a colour is
  legible and only this proves it was derived; the dark ramp had drifted to
  8 of 12 steps hand-pinned while passing every contrast assertion.
  `src/oklch.mjs` holds the OKLCH↔sRGB maths with gamut mapping, plus
  `rgbToOklch` for auditing a hex you did not generate.
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@stint/core`) so
  a retried insert is idempotent — the same id lands on the same row.
- Rate resolution exists in SQL (authoritative) and TS (previews). Keep them in
  sync; the database wins.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Local development

**Never point local dev at production.** `pnpm dev:up` runs the Supabase stack
locally and `pnpm dev` talks to it, because Next.js loads
`apps/web/.env.development.local` ahead of `.env.local` in development — while
`pnpm migrate` and `pnpm verify:schema` still read `.env.local` and reach the
hosted project. No flag to remember.

`pnpm dev:reset` rebuilds from migrations plus `supabase/seed.sql`. Sign in as
`dev@localhost.test` and click the link in Mailpit (`:54324`); mail is captured
locally, never sent. Studio is on `:54323`.

**One sign-in at a time per browser.** Sign-in is PKCE and the code verifier
lives in localStorage under one key per origin, so two tabs on
`localhost:3100` share it: requesting a link while another tab holds a session
overwrites the verifier and the exchange at `/auth/callback` fails against the
wrong one. The symptom is a link that looks dead — `/verify` returns its
`303`, the exchange fails a step later, and re-clicking says `Bad request`
because the token is spent. Two guards now exist: `/signin` redirects home
when a session exists, and requesting a link calls
`signOut({ scope: 'local' })` first — local only, so a link requested on a
laptop never revokes the session on a phone. Both are tested.

When a click fails, a `303` from `/verify` means verification worked; look for
the **`/token` call that should follow**, because its absence is the exchange
failing. `docs/local-dev.md` has the log filters and the pending-token query.

Use `localhost` throughout, not `127.0.0.1`: they are different hosts to a
browser, so a session cookie set on one is invisible to the app served from
the other.

`realtime`, `storage`, `edge_runtime` and `analytics` are off — the app's
Supabase surface is `.from()`, one `.rpc()`, and auth. The subset runs in
~540MB where the full stack wants ~7GB.

## Migrations

`pnpm migrate` applies `supabase/migrations/` over a plain Postgres
connection — no CLI, no pasting SQL into a dashboard. Each file runs in its
own transaction and applied versions are recorded in `schema_migrations`, so
re-running is a no-op and a new migration applies alone. `--dry-run` shows
the plan; `--url` overrides the connection.

**The publishable key is public by design** (it ships in the browser bundle);
RLS is the only thing protecting the data. That makes `verify:schema` the
real security control here, not the key choice — a table reaching production
without RLS exposes every user's rows, and nothing else in the stack notices.

`pnpm verify:schema` asserts the live database matches what the app assumes:
seven tables with **RLS on**, at least one policy each (RLS with no policies
denies everything), the partial unique index for the timer invariant, and the
signup trigger. Exits non-zero on failure, so it belongs in CI once a staging
database exists. Both read `SUPABASE_DB_URL` from `apps/web/.env.local` — a
secret that bypasses RLS and is never used by the app itself. It is **not**
the connection `pnpm test:rls` uses — that one connects as a non-superuser
`authenticated` role on purpose, because a superuser bypasses RLS and would
make the suite pass while proving nothing.

To test a migration locally without touching a real project, start a
throwaway Postgres (`/opt/homebrew/opt/postgresql@14/bin`) on a spare port
over TCP — the socket path in the scratchpad exceeds the 103-byte limit —
stub `auth.users` and `auth.uid()`, then point `pnpm migrate --url` at it.

## Generated files and a fresh clone

`packages/design-tokens/dist/` is gitignored, and two of its outputs are
needed to build: `tokens.ts` (imported by `color-picker.tsx`) and
`tokens.css` (imported by `globals.css` by relative path). A fresh clone has
neither, so `next build` fails with "Can't resolve '@stint/design-tokens'".

This is why `apps/web` has **`prebuild` and `predev`** that run the token
generator. Generating is part of building, not a step a caller has to
remember — CI happened to run `generate.js` for its own drift check, which
hid the gap until Vercel's first deploy failed on it.

Anything else generated and gitignored needs the same treatment: assume the
build machine has only what git tracks.

## Dependency versions

Everything is current. **TypeScript is on 6.x**, and the jump to 7 is a
deliberate wait, not drift.

TS 6 is the bridge release: the last one built on the JavaScript codebase, so
it **keeps the programmatic API** while adopting 7's stricter defaults. That
matters because Next's type checking and TS plugin use that API — TS 7 ships
without one until 7.1, which would leave `next build` running against a
compiler it was never tested with. Frameworks with embedded templates (Vue,
Svelte, Astro, Angular) are in the same position.

Adopting 6 cost two config changes, both of which are what 7 will require
anyway:

- `types: ["node"]` in the root tsconfig — 6 stopped auto-discovering
  `@types`, so what is used has to be named.
- `baseUrl` removed from `apps/web/tsconfig.json` — deprecated in 6, gone in
  7. The `paths` entries were already relative, so it was redundant.

So the migration to 7 is now a version bump plus whatever 7.1's API needs,
rather than a config project. Revisit when Next declares TS 7 support.

`@types/node` tracks the Node major actually in use (24), not whatever was
pinned first — types for a runtime you are not running is a silent trap.

Dependabot **ignores majors** on purpose. A toolchain major is a decision;
its first run offered TypeScript 5 -> 7 and `@types/node` 22 -> 26 unasked.

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
  fix-up on top; that is what happened to `client_updated_at` and `pdf_url`.
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
  reads the *stored session*, not the `Authorization` header that
  `bearerClient` sets via `global.headers`; with no stored session it returns
  `{ data: null, error: null }` — the call succeeds, yields no claims, and
  every bearer request 401s. No error is raised, and the route tests inject
  `__TEST_DB__` so they never exercise that path, which is why this shipped
  broken and was only found by curling a real token at a real server.
- `errors.ts` — `handle()` wraps every route; `ApiError` maps to documented
  status codes. Contains a compile-time guard asserting the local `Code` union
  matches `ErrorCode` in `@stint/schema`.
- `rows.ts` — the snake_case↔camelCase boundary for entries, clients,
  projects, settings and payment profiles. Rename one of those columns here
  and nowhere else.

  **Invoices are the exception, and it has already cost something.**
  `invoicing.ts` carries its own `toInvoice` and `toLineItem` plus a
  `ClientRow` interface, because the PDF loader needs shapes `rows.ts` does
  not model. That second converter is where drift appears: `toLineItem` takes
  `Record<string, any>`, so nothing type-checks it against the schema, and it
  omits `rateSource` — which the preview and generation paths *do* emit,
  because they build line items in memory rather than reading them back.
  Consolidating the two is worth doing; until then, a change to invoice or
  line-item fields means editing both files.

The browser's types in `lib/client/api.ts` **derive** from `@stint/schema`;
they are not copies of it. They were copies, and it drifted both ways —
removing `color` from the schema's `Project` raised no error in the app while a
component went on reading it, and `paymentProfileId`, `clientName`, `Invoice`
and `CalendarDay` all existed in the database and the routes without ever
reaching the schema.

The wrapper is `Response<T>`, which makes every field required. A schema marks
a field `.optional()` to describe what a *request* may omit, so `z.infer`
yields `field?: T | undefined` — but every converter in `rows.ts` sets every
field unconditionally, so a response never omits one. Without the wrapper the
UI would carry a `?? null` for each nullable column.
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

**The app sends no mail.** Invoices are downloaded and emailed by the user
from their own address; `PATCH /invoices/:id/status` records that it went out.

This is deliberate and should not be "fixed" by adding a provider: mail from a
shared application domain gets filtered or blocked on the way to a client, and
the sender only finds out when the client says it never arrived. Sending it
themselves uses their own domain's reputation and leaves a copy in their Sent
folder.

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

Bank details render on the **invoice PDF, never in an email body**. Every
major invoicing tool works this way, and it is the safer posture: details that
render identically on every invoice create a baseline, so a *change* becomes
visible — which is what fraud-prevention guidance tells payers to challenge.
**Do not add an option to email them.** Placement is not a user preference.

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
`LSUIElement`, because AppKit only honours "menu bar only, no Dock icon" from
a bundle's Info.plist and not from a bare executable. Unsigned: distribution
needs a Developer ID and notarisation.

**It is the timer and nothing else** — start, stop, task name, project.
`principles.md` scopes it to "menu bar presence" and warns that neither native
app should become a port; entries, invoices and the calendar stay in the
browser, behind the panel's one "Open Stint" link.

- **Sign-in is the emailed link, verified in-process** against GoTrue's
  `/verify`. **The field is `token_hash`, NOT `token`** — the value in the
  emailed URL is already hashed, and passing it as `token` returns
  `otp_expired` on a link generated one second earlier, which reads as an
  expired link and sends you hunting for the wrong bug entirely. Verified
  against a real GoTrue before the code was written.

  PKCE was rejected for the same reason it bites on the web: the verifier
  lives per origin, and an app holding one while the link opens in a *browser*
  is that split-brain in a worse form. `supabase-swift` is not a dependency —
  two POSTs do not need an SDK.
- **The session lives in the Keychain**, not `UserDefaults`: a refresh token
  is a long-lived credential and a plist in the container is readable by
  anything running as the user. `jwt_expiry` is an hour with rotation on, so
  refresh is mandatory — an app left open overnight would 401 on every poll by
  morning and read as broken rather than signed out. One in-flight refresh is
  shared, because two pollers racing would each spend a rotating token and one
  would lose.
- **Local tick, reconcile at 60s**, skew-corrected from `serverTime`. Today's
  total adds live seconds **from the fetch**, not from `startedAt` — the route
  already folded the running entry in, so counting from the start double-counts
  it.
- **A 409 from `/timer/start` refreshes rather than reports.** Another device
  won the race, the invariant held, and showing what *is* running is more use
  than the error. This caught a real leftover timer during development.
- **The task field never overwrites itself mid-type.** It follows the server
  when a timer starts or stops elsewhere, but only when unfocused.
- **Colours come from `Tokens.swift`, written by `pnpm tokens`** into the app's
  own sources. SwiftPM cannot read the gitignored `dist/`, and a hand-copied
  palette is the drift the token package exists to prevent, so the generator
  writes both. Note the Swift names keep the raw prefixes — `borderSubtle`,
  not the Tailwind-stripped `edgeSubtle`.
- **The runaway notice says something is wrong and stops there.** The web app
  offers Keep / Adjust / Discard because it can edit an entry; adjusting needs
  a date and two times, which this panel has no room for. Surfacing without
  acting is still the honest half of "never auto-trims".

**The API models are hand-written and nothing type-checks them against
`packages/schema`.** `architecture.md` wants an OpenAPI spec from the Zod
schemas for exactly this; until it exists, a renamed field fails at runtime in
Swift and nowhere else.

## Docs

**`docs/tasks.md` is the only list of unbuilt work.** There is no roadmap file;
two lists means one is stale and you cannot tell which. A finished task is
**deleted**, not ticked — git records what shipped and this file records why,
so a list of completed work is a changelog nobody maintains. Something decided
*against* is also deleted, with the refusal moved to
`docs/design/principles.md` where it will be read before being re-proposed.

`docs/api.md` marks unimplemented endpoints **(not implemented)** — there are
none right now. Keep that honest: the audit that produced this section found
docs describing planned work as built, which is worse than no docs.

**The app is online-only.** There is no outbox and no `POST /sync`; both were
removed as unused. `docs/architecture.md` records why, and why a sync engine
still would not be the answer if offline ever comes back.

## Two sites, one deployment

The marketing page and the product are split by **hostname**, decided in
`apps/web/src/proxy.ts` — `proxy.ts`, not `middleware.ts`, because the
middleware convention is deprecated in Next 16 and renamed.

    trackwithstint.com      -> app/landing/page.tsx   (rewritten, not redirected)
    app.trackwithstint.com  -> app/(app)/**

**The app lives at the root of its own origin, so its URLs carry no segment.**
`/invoices/…`, never `/app/invoices/…`. A `/app` path segment was tried first
and rejected: under a `.app` TLD it read as a stutter, and in the source tree
it produced `src/app/app/`. The subdomain removes the segment rather than
renaming it.

The apex `/` is **rewritten**, so the visitor keeps the bare domain in the
address bar and the first impression costs no extra round trip. Any other apex
path **redirects** to the subdomain, so an old link still arrives.

Consequences worth knowing:

- **The landing page is fully static.** The session cookie belongs to the app
  subdomain, so the pitch never reads one and never renders per-request. Do not
  add a session check to it — that was there in the first draft and the split
  is what made it unnecessary.
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

Three ticked lines for what it does — **Track hours. Send invoices. Get
paid.** — then four struck-through lines for what it refuses, then the price.
The refusal used to be a clause buried in a subhead paragraph, which is where
the single most differentiating sentence on the page went unread.

**The struck items are muted and struck, never red.** Red is this app's danger
channel — it means something is wrong — and a stack of red marks reads as
"this product is broken" for the half-second before it parses. Grey plus a
line through it reads as *deliberately not included*, which is the proud
version of the same fact.

**The ticks are the accent.** On this page green means *what Stint does for
you*, and the ticks, the CTA and the hero timer are all that one idea — which
is what the meanings-not-instances rule asks for. They were cyan
(`text-success`) first; green ties the left column to the timer panel on the
right, which cyan did not, and the ticks read as a single object because they
sit in a tight vertical column.

What would break it: green on a section heading, a link, a border or a
flourish. Those are not the meaning, they are just green.

**The `<h1>` carries an `sr-only` sentence** covering both lists, because a
screen reader hitting "Track hours. Send invoices. Get paid." followed by four
struck words has no way to know the second list is negated — `line-through` is
presentational and is not announced. The visible ✗ list is `aria-hidden` so it
is not read twice.

**Free gets its own block with a rule, not a card.** A card there would
compete with the timer panel beside it.

An earlier headline set "That's it." in mono with a drawn rule under it. It is
gone, but two findings from it stand: a coloured rule under headline text wins
the screen away from the CTA, and an `underline` in a headline reads as a
link — draw a rule instead if one is ever wanted again.

**The invoice preview renders its total in near-black, not the light-theme
accent.** The real PDF uses `#1D7815` there, which is right on paper; on this
page it would put a second green meaning beside the CTA.

`SHOW_PLATFORMS` gates the "everywhere you work" section. It is **false** until
the macOS and mobile apps actually ship — the section claims something a
visitor can falsify by going looking for a download, which is a trust failure
on the same axis as silently editing someone's hours.

**No real personal data in the examples.** The invoice preview is billed from
"Your name here / you@yourdomain.com". It shipped once with a real name and
email on it, on a public page that also renders bank-detail labels. Sample
rows are for showing the shape, and a name is not part of the shape.

**Sections are full-bleed; `Container` holds the measure inside them.** That is
what lets a section carry `bg-surface-recessed` edge to edge — the page gets
its rhythm from alternating ground, not from rules or gaps. The first draft was
one `max-w-3xl` column for the whole page and read as a document with 60% of a
1280px screen empty beside it.

**Every grid needs an explicit `grid-cols-[minmax(0,1fr)]`, including at the
single-column breakpoint.** A grid item defaults to `min-width: auto`, so on a
phone the timer card's intrinsic width set the column and the whole page
scrolled sideways. The `lg:` two-column track is not enough on its own.

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
generates a real Tailwind `@utility` carrying family, size, weight, tracking,
case and tabular-nums together, so half a role cannot be applied. Colour stays
separate: a role says how text is set, not what it means.

Need something the scale lacks? Add a role, with a reason. `pnpm check:type`
runs in CI and rejects arbitrary sizes, arbitrary or preset tracking, bare
`font-mono`/`font-sans`, Tailwind's own font scale, and any `type-*` that is
not a real role — that last one matters because a typo'd role compiles to **no
CSS, no warning, exit 0**, the same silence that makes `detox` necessary.

This is enforced because documenting it did not work: the scale was written
down and the app still grew twelve arbitrary font sizes across twenty-five
components, two pairs of which differed by 0.5px for no reason, while the
documented timer and title roles went unapplied. See
`docs/design/typography.md` for the roles and what each is for.

### Layout

The nav is a **vertical rail** (`nav.tsx`), with the wordmark at the top
doubling as the Home link and the running timer beneath it. Horizontal nav was
already needing `overflow-x-auto` at five items plus the timer, and the rail
grows downward where there is room. It also stops the content column fighting
the viewport: with the rail holding the left edge, the calendar gets the width
it wants.

On a phone it becomes two rows — identity and timer on top, sections scrolling
beneath. They must not share one scrolling row: that pushed the running timer
off the right edge, so it was invisible on the screen where it matters most.

**The rail does not scroll with the content.** At `sm` and up the page itself
is pinned (`h-dvh` + `overflow-hidden` on the flex row) and the content column
scrolls inside itself; the rail is a sibling of that scroller, so it stays put
without being `position: fixed` and without anything needing a scroll offset.
The rail's own section list can scroll vertically if it ever outgrows a short
window, so the account menu at its foot cannot be pushed off-screen. Below
`sm` the whole page scrolls normally — pinning a strip that is already two
rows tall would eat a third of a phone viewport.

**Adding a section costs nothing in the rail.** It is a fixed `sm:w-52` and
grows downward into empty space, so "we already have five items" is not an
argument against a sixth — that was the argument *for* the rail, and the rail
solved it. The real bar is on content, not on the nav entry: a screen ships if
it carries a number the user cannot compute in their head, or rows they can
act on. The phone strip is the one place where more sections genuinely cost
something, and there they scroll.

The **account menu** sits at the foot of the rail (`account-menu.tsx`),
showing the signed-in email and holding **Settings**, **Appearance** and
**Sign out**. Settings is deliberately not in the rail's section list: the
rail is places you go, and configuration visited rarely does not belong
beside Home and Calendar.

**Appearance (dark/light) lives here, not in Settings and not in the rail.**
Settings is business configuration — billing defaults, invoice identity,
numbering, payment profiles — and a theme is not that; it is the one genuinely
personal preference the app has. Not the rail either: a control is not a
destination, and it would spend a rail slot on something touched once.

**There is no "System" option, on purpose.** The palette is dark-first — the
token file keys its light block to an explicit `[data-theme="light"]`, so a
light OS preference does not flip the surfaces. "System" would resolve to dark
for everyone, including a viewer whose OS is light: a control that appears to
do something and does nothing. See `docs/design/color.md` for what to change
if the app should ever follow the OS for real.

**It is not a Profile page, and that was a decision.** Settings is entirely
business configuration — billing defaults, invoice identity, numbering,
payment profiles — and none of it is "who am I". A profile for a single-user
app holds an email, a sign-out and eventually a theme: three items, not a
page. The email *is* the account; there is no name, avatar or organisation.

**This is where sign-out lives, and the app previously had none at all** —
you could get in and not out. `signOut()` then `router.replace('/signin')`
*and* `router.refresh()`: the server components were rendered for a signed-in
user, so without the refresh a Back navigation shows cached authenticated
markup.

Relatedly, `request()` in `api.ts` sends any **401** to `/signin`. Without it
a signed-out page rendered its shell and sat on "Loading…" forever — React
Query has `retry: false`, so the 401 never resolved into anything actionable.
Hitting Back after signing out did exactly that.

**A card's header rule is inset, never a full-width border.** The divider
between a card header and its content is a `mx-4 border-t` div, holding the
same `px-4` the rows below it use. A `border-b` on the header itself runs edge
to edge and cuts the panel in two, which reads as two stacked cards rather
than one card with a header. The shared `Card` in `home-cards.tsx` is the
reference; `activity-strip.tsx` matches it by hand because it predates the
shell. `field.tsx` deliberately has none — its title is followed by its own
description, and a rule there would separate the two.

`Page` (`page.tsx`) owns the content column. Every screen used to carry its
own copy of `mx-auto max-w-3xl px-4 py-8 …`, which is how the calendar ended
up silently on a different width. `wide` is for screens that are a grid rather
than a column.

**Its top padding is smaller below `sm`**, because the nav is a different
object there. At `sm` and up the rail sits *beside* the content, so the column
opens against the top of the frame and wants the full inset; on a phone the
nav is a horizontal strip directly above, and the same 32px stopped reading as
margin and started reading as a gap. Only the top changes — the bottom still
needs clearance above the docked timer bar.

**The default `Button` variant is neutral.** The accent is opt-in via
`variant="accent"`, because the previous default painted every primary action
green while the rail's running timer was also green — two accent meanings in
view, which the accent rule exists to prevent. Adding a client is not the most
important thing on the clients page. Tested, and the test was verified to fail
when the default goes back to the accent.

**Buttons and nav carry icons, and an additive action carries a `+`.** Text +
colour + icon is more legible than any single channel, and the plus reads
before the label does. Icons are `aria-hidden` so the accessible name stays
the label alone — a screen reader should not announce "plus".

`lucide-react` is **already a dependency** (shadcn's dialog and dropdown use
it); no icon library needed to be added. Icons never appear alone in nav: an
icon is a fast second channel for a destination you already know and useless
for one you do not, so the label is what makes it findable the first time.

### Components

`components/ui/` is **vendored shadcn**, rewritten to our tokens at install
by `apps/web/scripts/shadcn-detox.mjs`. shadcn's palette names are never
defined in `@theme`, because two of them collide with ours and mean the
opposite: its `bg-primary` is the action colour (ours is neutral grey) and
its `bg-accent` is hover grey (ours is the neon green).

To add a component: `pnpm dlx shadcn@latest add <name>`, then
`node scripts/shadcn-detox.mjs 'src/components/ui/<name>.tsx'`, then read the
diff. Add any unmapped name to `MAP` rather than hand-editing the file.

**The detox check is the only enforcement.** Tailwind 4 drops an unknown
utility with no warning and exit 0, so a surviving `bg-primary` renders our
grey on a primary button and the build still passes. `pnpm detox` runs in CI.

Beyond colours, the converter also rewrites what the check cannot see:
`bg-black/50` → `bg-overlay`, Tailwind's `shadow-lg`/`shadow-md` → our
elevation tokens, and a floating panel's `bg-background` → `bg-surface-elevated`
(shadcn means "the app surface"; ours is the recessed ground, so a dialog left
on it would sit *below* the page it floats over).

The converter is one pass over an alternation, not sequential `replaceAll` —
cascading turned `bg-primary` into `bg-surface-hover-default` (a green button
silently grey) when a later rule matched its own output.

Radix supplies dialog/dropdown/popover behaviour. Hand-rolled popups are how
arrow keys, typeahead, roving tabindex and focus-return get quietly skipped;
the restraint thesis is about *product surface*, not re-implementing
accessible primitives.

### Projects

**Two surfaces, different jobs.** `/projects` (`project-list.tsx`) is where
you find a project; the Projects section on a client (`client-projects.tsx`)
is where you manage one in the context of its rate.

A flat list was rejected and then needed anyway, because the nested section
**cannot reach a project with no client** — there is no client detail page to
open, since there is no client. Putting those rows on the clients list does
not help either: they would have to link to a client that does not exist.

**Grouping by client answers the original objection** rather than trading
against it. Three rows named "Website redesign" in one undifferentiated list
have to be decoded; under client headings they do not. The heading carries the
client's own rate, so an inherited row reads against it. And "No client"
becomes a *heading* rather than an entity: a heading needs no detail page, no
rate and no Edit button, so what was incoherent as a pseudo-client is ordinary
as a group label.

**"No client" is never labelled "internal work".** `client_id = null` covers
at least three states the app cannot tell apart: genuinely internal, **not yet
assigned** (billable work that will silently never be billed), and
speculative. The attention card already treats the middle one as wrong —
"cannot resolve a rate" — so an "Internal" heading would contradict it.
`isBillableDefault` is the one real signal, and it is the user's own answer;
do not overwrite it with a guess. Tested.

**A project whose client cannot be resolved falls under "No client" rather
than vanishing**, and an archived client keeps its own heading — filing its
projects under "No client" would be a lie, and they are exactly the rows
someone checks when reviewing a finished engagement. This is why the list
fetches clients with `includeArchived`.

**`ProjectRate` (`project-rate.tsx`) is shared by both surfaces.** Most
projects store no rate of their own, so printing the column would show nothing
for the common case — the opposite of the truth. It resolves through
`resolveRate` from `@stint/core`, the same function the invoice preview uses;
a second implementation would be another thing to drift.

**The row shows the figure alone, not where it came from.** Naming the source
on each row ("from Northwind Trading", "overrides Northwind Trading's
$150.00") put a sentence under every project and read as clutter — and on
`/projects` it restated the client heading immediately above it. The number is
what gets checked; the hierarchy is legible from the grouping and from the
dialog that sets it. `resolveRateSource` is still used — `buildLineItems`
calls it, so a preview and a freshly generated invoice carry `rateSource` per
line. An invoice read back from the database does not: there is no
`rate_source` column, which is why the schema marks the field optional.

No resolvable rate renders in the **danger** channel, not as `$0.00`:
invoicing refuses to generate from unrated entries, so without it the failure
is discovered at the moment of billing.

### The home screen

`home-cards.tsx` renders Needs attention, Unbilled and Pace, in that order:
money at risk, money waiting, money coming. The hero and the entry list are
fixed around them — they are why the screen is opened fifty times a day.

- **`GET /stats` is one call** because the cards render together and a set
  that pops in piecemeal reads as broken.
- **Unbilled totals come from `unbilled_by_client`**, a SQL rollup grouped by
  **(client, rate)**. The rate is part of the grouping key for the same reason
  it is on an invoice line: one client can have work at several rates, and
  collapsing them misstates the money. A first version grouped by client alone
  and reported $1755.00 where $1462.50 was owed — the seed reproduces that
  case deliberately. Its coalesce chain must stay identical to
  `resolve_entry_rate`, or the home screen and an invoice preview will
  disagree about the same work.
- **This content is now the Inbox, in the dock, and it is ALWAYS present.**
  It used to be a "Needs attention" card that rendered only when it had rows,
  on the argument that a permanent "all clear" is the `SaveIndicator` problem
  — a check that is always present says nothing.

  **That was wrong, and the rule does not transfer.** A `SaveIndicator` is
  transient and sits inline with a form, so always-present really does mean
  always-ignored. A dock region is *furniture*: staying put is the entire
  point, a section that vanishes leaves the user wondering where it went, and
  "Nothing needs you" is information rather than noise. The card also reflowed
  the page at the exact moment you fixed something.

  The rename follows from that. "Needs attention" is a predicate and suited a
  thing that appeared only when the predicate held; an inbox is a place, and
  this is now a place. See `apps/web/src/components/inbox.tsx`.
- **Pace hides entirely with no target**, rather than showing an empty bar
  that asks to be configured. It measures against **business days elapsed**:
  a 120-hour target is six hours a working day, and reading "behind" on a
  Monday because the weekend passed is noise pretending to be signal.
  Holidays are not modelled, deliberately.
- **No card carries the accent** — on this screen the accent is spent, and it
  is spent on the running timer. The progress bar is neutral.
- **The cards write, narrowly.** Marking an invoice **paid** or **sent** is
  offered inline, because that is the action that legitimately clears an
  attention row — the underlying fact changed. **Nothing destructive is
  offered here:** voiding and deleting belong on the invoice itself, where the
  whole document is in view, and a stray click on a glance must not destroy a
  financial record. Tested, including that no void/delete control exists on
  the card.

  This narrows an earlier rule that said nothing on this screen writes at all.
  That was too broad: it made the card a dead end, since every row cost a page
  load to act on. The real constraint is that every write is explicit, names
  itself, and is never destructive.

- **Overdue has a 7-day grace period** (`OVERDUE_GRACE_DAYS`). Firing the
  moment `due_date` passes is accurate and useless: Net 30 with a client who
  pays on day 32 is ordinary, and a card that flags it trains the user to
  clear the list without reading it — which is how the one genuinely late
  invoice gets dismissed with the rest. The invoice page still shows the true
  due date; this only governs when the card speaks up.

  **A snooze was considered and rejected.** Hiding a row that is still true
  makes the card something dismissed reflexively rather than read, and the
  user most likely to snooze everything is the one it exists for. A grace
  period makes the card quiet enough that nothing needs dismissing, and
  recording a chase (a later task) keeps the fact instead of hiding it.
- **Unrated work shows an em-dash, not $0.00**, plus an `unratedCount` so the
  total reads as incomplete rather than low.
- **Never labelled "earned" or "revenue"** — it is work done and not yet
  invoiced, money the user might still never see.

Details wrap under the label on a narrow screen rather than hiding: "12 days
late" *is* the row, and a client name with an amount is just an invoice.

**`unbilled.total` and `awaitingPayment` are different money and must never be
summed.** Unbilled is work not yet invoiced; awaiting payment is invoiced and
not yet collected. Adding them double-counts the same hours. Awaiting payment
is **one line** at the foot of the Unbilled card, not a card and not a row per
invoice — a row each would put ordinary, nothing-is-wrong invoices back on the
home screen and undo the overdue grace period under a calmer heading. Tested,
including that the sum appears nowhere.

### The activity strip

Twelve weeks, one cell per day, in `activity-strip.tsx`.

- **Hue is the client; intensity is hours.** A single-hue ramp cannot answer
  "when did the Acme work actually happen?", which is the question that comes
  up in scope discussions. A day split across clients takes the hue of its
  **largest share** — not a blend, which would read as a colour no client
  owns.
- **Never green.** `#52FC43` means the running timer, so a green intensity
  ramp would put a second green meaning on the same screen. Tested, including
  that the accent's rgb appears in no cell.
- **Gaps are a real surface, not a hole.** All 84 cells render; a blank day is
  a vacation or a dry spell and both matter, and a strip of only worked days
  would hide the rhythm. Intensity floors at 0.25 so a short day is visible
  rather than indistinguishable from rest.
- **Internal work still reads as worked** — no client, so no hue, but not
  rest either.
- Twelve weeks rather than a year: a GitHub-style annual grid works because a
  commit is binary and the grid dense. A contractor's year is five days a week
  with holidays cut out, so at 52 weeks most cells are empty and the rest are
  the same shade.

It fetches `granularity=day`, which reuses the calendar endpoint's
server-side local-day bucketing — the DST-correct grouping already lives
there, and a second client-side implementation would drift.

### Reconciling on /invoices

`/invoices` is the screen to open when money lands, which is why home needs
only the one number. It defaults to **open** (draft + sent), carries a total
of what is genuinely **outstanding** (`sent` only — a draft has not been asked
for and a paid one has arrived), and offers inline **mark paid** on sent rows
alone.

The empty state distinguishes an empty account from an empty filter: "No
invoices yet" would be a lie when one exists and is merely paid, and it would
send the user to create a duplicate.

Each action names its invoice (`Mark STINT-0001 paid`), because a list of
identical buttons is unusable with a screen reader. Nothing destructive here
either — voiding stays on the invoice itself.

### Invoicing UI

**Preview then generate, and the two must agree.** Any change to what would
be billed — client, period, grouping — clears the approved preview and hides
the Generate button. Approving one set of numbers and generating a different
set is the failure this prevents; it is tested, and the test was verified to
fail when the invalidation is removed.

Generation is disabled when the preview reports `unratedEntryIds` (an entry
with no rate would bill at zero) or has no line items.

**A draft is deleted; an issued invoice is voided.** A draft holds no number
yet, so deleting it costs nothing. Once issued the number is on record and
only voiding is offered — that is what keeps numbering gapless. The UI shows
one and never the other.

Downloading the PDF is the **primary action** and is offered in every status:
with no email, the download is how an invoice reaches a client.

Paid renders in the success channel (cyan), never green.

### The timer bar has two arrangements, not one

Running and idle want opposite things from the width, so they are written as
two branches rather than one layout with pieces hidden.

**Idle is a composing row** — the field is the subject and takes the space.
**Running is a readout** of four small objects (dot, name, project, clock), and
stretching those to the window's corners left ~900px of nothing between the
first and the last: two fragments at opposite ends of the screen that read as
unrelated. Centred, they read as one object, which is what they are.

**Both wrap to two rows on a phone.** 375px cannot hold four things plus a
seven-character clock: squeezing them onto one line crushed the task name to
15px, then to a useless "Ge…" beside an equally useless "Sti…". Two truncated
words are worse than one whole one.

Running splits by meaning — *what* you are working on (name, project) on top,
*how long* plus the control beneath — so each row is one idea rather than a
queue of fragments. Idle puts the field on its own line, since no phone gives
"What are you working on?" a usable width beside a tag and a clock.

**The first row is one grouped element, not three siblings.** Flex-wrap places
items before it shrinks them, so as loose siblings the project tag wrapped to
a line of its own rather than letting the name truncate beside it — three rows
where two were intended. The group dissolves at `sm` with `contents`, so the
desktop row still centres four equal items.

**The name shrinks but never grows.** `flex-1` was tried and it re-created the
exact problem the centring exists to solve: a greedy name fills a wide screen
and shoves the tag and clock back to opposite corners. Resilient, not greedy.

**The running task name is TEXT, with an explicit rename button.** It was a
live `<input>` for the whole run, which made a stray click into a rename of
billable work and made the bar look like a form waiting for input on every
screen. The pencil is **always rendered, never hover-only**: hover does not
exist on touch, and this is the one control with no other route — a name typed
wrong at the start is otherwise uncorrectable until the entry is stopped.

Entering the rename seeds `editing` with the server's name, so the draft and
the mode are one piece of state that cannot disagree. The commit rules are
unchanged: blur or Enter writes, Escape reverts, an unchanged name writes
nothing. `focus()` must precede `select()` — selecting does not focus, and
without the focus the field opens with no cursor AND never fires the blur that
commits. Tested, including that the running name is not a field.

**The project picker is a tag**: bordered, with a chevron, dashed when empty.
Borderless it read as static text — a swatch beside a name, with nothing
inviting the click. The empty state keeps its border rather than going ghost,
because an unassigned timer is exactly when the control most needs finding.

### The runaway timer choice

Past `max_timer_hours` the timer bar offers **Keep · Adjust · Discard**, which
is what makes "surfaces, never auto-trims" an honest promise rather than a
refusal to help. The banner used to say "stop it and adjust the duration" with
nowhere to do either.

- **Keep touches nothing.** It dismisses the notice and leaves the timer
  running, because a long timer is often correct — stopping it would be the
  app editing billable work, which is the exact thing the principle forbids.
  Tested, and the test fails if Keep also stops.
- **Adjust stops first, then opens the entry editor.** A running entry has no
  end yet, so there is nothing to adjust until it is stopped, and stopping is
  what the user meant.
- **Discard asks once.** Stop plus delete, and discarding sixteen hours you
  actually worked is not recoverable.
- The notice returns on a fresh overrun: `dismissed` resets when
  `exceedsThreshold` goes false, so Keep silences this overrun rather than the
  feature.

### Editing an entry

`entry-dialog.tsx` is the only place a logged entry is created, corrected or
deleted, and it is what makes two promises elsewhere true: that the numbers on
an invoice are the numbers you worked (only honest if a mistake can be fixed),
and that a runaway timer is *surfaced* rather than auto-trimmed (only honest if
there is somewhere to do the trimming).

- **The inputs are local wall-clock; the API is UTC.** `toInstant` resolves a
  date + time in a timezone by guessing UTC and correcting by the offset the
  guess lands in — DST-correct because the correction is computed *at* the
  target instant rather than assumed from today. Verified round-tripping
  across both US transitions, the ambiguous fall-back hour, a half-hour
  offset and UTC+14. Never do fixed-millisecond arithmetic here.
- **An end before the start is overnight, not an error.** 22:00 to 02:00 is a
  four-hour shift; rejecting it is defensible and useless to someone who
  worked those hours. The end rolls forward one calendar day.
- **An entry billed on an ISSUED invoice opens read-only** with the reason and
  the remedy ("void the invoice to release it"). The lock is a database
  trigger, so an edit would 409 — offering a save that cannot succeed is
  dishonest. Every field disables and the only remaining action is dismiss.

  **A DRAFT is not a lock**, and `guard_billed_entry` says so: it returns
  early when the invoice status is `draft`, because a draft holds no number
  and has not been sent, so nothing has been told to a client yet. The dialog
  disabled on any `invoiceId` and so refused an edit the server would have
  accepted — the more expensive direction to be wrong in, since the fix for a
  wrong draft is to correct the entry and preview again. Editing one now warns
  that the draft needs previewing again rather than blocking it.

  The status is not a column on the entry, so the dialog fetches the invoice —
  only when there is one, which is the rare case. An embed was rejected:
  `test/shim.mjs` passes the select string into raw SQL, so PostgREST's
  `invoices(status)` syntax would break every route test.
- **Deleting asks once.** The row is one click from the duration and the
  delete is irreversible.
- **Creating supplies a UUIDv7** so a retried insert lands on the same row.

All five are tested, and each test was verified to fail when the behaviour is
removed.

### The calendar

A week grid of what was tracked. It visualises, it does not schedule — no
planned layer, no external calendar.

**Never step days or weeks with `+ 86_400_000`.** Use
`startOfLocalDayOffset` (negative `daysBack` steps forward): a week
containing a DST transition is 167 or 169 hours, and a fall-back day is 25
hours long, so fixed-millisecond arithmetic lands an hour off and mis-buckets
the entries at the edges. Block positions divide by the column's own span for
the same reason.

**A phone gets ONE day, not a squeezed week.** At 375px a week gives each day
42px: a block is a single letter wide, an overlapping one is 20px, and the
drag target is under the ~44px a finger needs. That is the laning rule's own
principle failing — a block you cannot read is a block you cannot check. One
day gets ~295px, so titles read in full and the drag gesture becomes usable
(146px per lane even for two overlapping entries).

**The phone has no inner scroller, and the day is cropped to the hours in
use.** Two scrollers competing for one viewport is what produced a double
scroll: the grid took `62vh` — a fraction of the VIEWPORT, which knows nothing
about the 210px of chrome above it or the dock below — and still hid 217px
inside itself while the page had 240px more to go. Worse, no fixed height can
fix that, because the inbox below is variable.

So the page owns the scroll, which is one gesture at any inbox size. Cropping
is what keeps that honest: an uncropped 24h column would just move the same
excess into the page, and on a typical day a quarter of the grid is an empty
midnight-to-six. `workedWindow()` takes the entries' range, pads an hour either
side (so a block is never flush against an edge with nowhere to drag it
earlier), floors it at 10 hours, and shows 07:00–19:00 when nothing was
tracked. Height is 44px/hour up to a 620px cap — without the cap a day running
to a still-open midnight rendered 912px, taller than the 720px it replaced.

**Positions are fractions of the WINDOW, not of the day.** `instantAt` already
takes arbitrary instants, so `grid.ts` needed no change — but the column must
be handed `day.from`/`day.to` rather than the day's own bounds, or every click
lands at the wrong time. Verified: a click 50% down an 06:00→01:00 window seeds
14:30.

The week view keeps all 24 hours, because seven columns share one window and
cropping would crop them all to the busiest day's range.

The grid is the same component either way; only the number of columns and the
meaning of the arrows change. **The arrows step whatever unit is on screen** —
one day on a phone, one week otherwise — so "back" always means "the previous
one of these", and the labels say which. The heading names the day
("Thu, Sep 10") rather than the month, and the total, the empty-state wording
and the legend all follow what is actually rendered.

**The fetch stays weekly regardless**, so stepping within a week costs no
request and rotating a phone needs no refetch: the day view is a lens over
week data, not a second data path. The hook keeps **one offset counted in
days** and derives the week from it — two offsets would drift apart the moment
you crossed the breakpoint.

This is `useMediaQuery`, not a Tailwind `sm:`, because a breakpoint that
changes *behaviour* cannot be expressed in CSS. Reach for `sm:` first; this
exists for the rarer case. It is `useSyncExternalStore`-based and its server
snapshot is `false`, so a component must render correctly as "wide" for one
paint. jsdom has no `matchMedia` — `test/ui/setup.ts` shims it to not-matching
and `calendar.test.tsx` overrides it per test.

Each day also carries its **own exclusive end** rather than reading the next
column's start. The component used to do the latter, which breaks the moment
the list is one day: the fallback was the week's end, days away, and the
fraction→instant maths a drag depends on would have been wrong by that much.

**A legend keys the colours, built from what is on screen.** A block's left
border is its client's colour, which answers *whose work is this?* only once
you know which hue is whose — before this the mapping was learnable only by
clicking a block and reading the dialog. It is derived from the rendered
entries rather than from the client list, so it never names a colour that is
not showing, and it changes as you page (by week on a desktop, by day on a
phone) because it describes exactly the period in view. Ranked by time
tracked, like the activity chart.

Two differences from the activity chart's legend, both deliberate: there is
**no `MAX_SERIES` cap**, because a week holds few enough clients that a cap
would hide a real one (30 stacked bands is what forces the chart's hand), and
internal work is named **"No client" with an outlined swatch** rather than
merged into a neutral "Other" band — it has no stripe on the grid, so its
swatch shows the absence rather than inventing a grey.

`useProjectClients()` in `use-project-colors.ts` supplies both the colours and
the client grouping from one pair of queries. `useProjectColors()` is now a
thin wrapper over it; **both include archived clients**, which also fixed a
quiet bug — entries billed to a finished engagement were losing their colour
on the calendar and the entry list.

Overlapping entries get side-by-side lanes rather than stacking — in a
billing tool a block you cannot see is a block you cannot check. Tested, and
the test was verified to fail when the laning is removed.

#### Correcting time from the grid

This is where a mistracked block is noticed, so it is where it gets fixed: a
block opens the editor, dragging it adjusts its times, and clicking empty grid
starts a new entry at the time clicked. Before this, noticing a mistake meant
leaving the view you noticed it in.

The inverse of the painting maths lives in `packages/core/src/grid.ts` —
fraction of a column back to an instant — separately from the forward
direction because it carries a trap the forward one does not, and every
function takes the column's real span rather than 24 hours.

- **Drags snap to 15 minutes** (`SNAP_MINUTES`). A pointer lands on whatever
  minute a pixel happens to be, so an unsnapped drag bills 09:07–10:52 and
  calls it precision. The snap is also what makes the gesture safe to offer on
  billable time at all: it is the difference between a 4px slip being
  invisible and it being a billing change.
- **A move preserves the duration exactly; only a resize changes it.** The end
  is derived by adding the original elapsed milliseconds, never by re-deriving
  a wall clock — a two-hour block dragged across a DST boundary is still two
  hours of billable work. Tested, and the test fails when the end is
  re-derived.
- **Dragging an edge past the other clamps to 15 minutes rather than
  inverting.** The overnight reading (22:00–02:00) belongs to *typed* times,
  where it is what the user meant; a gesture saying "this block ends here" has
  no such reading.
- **A billed or running block refuses the gesture.** The billed lock is a
  database trigger, so a drag would 409 after the fact and spring back with no
  explanation; a running entry has no end to adjust and the timer bar owns it.
  Both still open the editor, which says why.
- **The gesture commits only on release, and only past
  `DRAG_THRESHOLD_PX`.** A block is *also* the control that opens the editor,
  so without a threshold every click would land a PATCH. The click that
  follows a drag is then suppressed by a flag the click consumes — asking
  whether a drag is *in progress* cannot work, because pointer-up clears it
  before the click fires. That ordering was a real bug, caught by a test.
- **Clicking empty grid opens the editor pre-filled rather than writing a
  row.** A click on a grid is too cheap a gesture to create a financial record
  from. It seeds one hour, the commonest block.
- **Each day heading carries an "Add an entry on …" button.** Clicking a time
  is pointer-only, so without it the create path is unreachable by keyboard —
  and it is the discoverable one, since clicking empty grid is faster but
  invisible until tried. The column's own click handler is suppressed lint,
  with the reason recorded: a role on the canvas would be a lie, and the
  blocks inside it are the real controls.

**A drag is vertical, within one day.** Moving an entry to another day is the
rarer correction and the dialog already does it; keeping the gesture in one
column is also what lets the maths use that column's own span.

**The DST tests assert a wall clock, not that minutes divide by 15.** A fixed
24-hour denominator also lands on quarter hours — it just lands on the wrong
ones — so a divisibility check cannot tell the two apart. It was written that
way first and a mutation walked straight through it.

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

Husky runs `lint-staged` on every commit, which runs `biome check --write` over
the **staged files only** and re-stages what it fixed. Sub-second, because it
never walks the repo.

It exists because there was nothing between the editor and CI: a formatting
slip cost a full CI round trip and a follow-up commit, twice in one evening,
for something Biome fixes itself in milliseconds. Lint is the *first* step in
CI precisely so an obvious slip fails fast — but failing fast in CI is still
two minutes slower than not failing at all.

**Deliberately only formatting and lint.** `husky init` writes a `pnpm test`
hook by default; that was replaced. A commit is not the right moment to run a
test suite — it makes committing something you avoid, and the point of a hook
is that you stop noticing it.

It is a convenience, **not the enforcement**: `pnpm lint` in CI is still the
gate, because a hook can be skipped with `--no-verify` and does not exist on a
fresh clone until `pnpm install` runs `prepare`.

### End-to-end tests

`pnpm test:e2e` — Playwright against the **local Supabase stack**, which must
already be running (`pnpm dev:up` plus `pnpm dev`). Deliberately outside
`pnpm test`: a browser download must not become a prerequisite for the unit
suites.

**No retries, in CI either.** A retry was never fixing anything — it doubled
the time before a real failure was reported. A genuine failure is a 30s
timeout, so two failures became four: the run that prompted this took 4m40s
against a healthy 2m33s. The trade is that a genuinely flaky test now goes red
rather than self-healing, which is the intent at ten tests and ~31s of work.

**The stack's Docker images are cached in CI**, keyed on the pinned `supabase`
version in `package.json` since that decides the image tags. The pull cost ~50s
and is the one step depending on a third party: `public.ecr.aws` rate-limits
anonymous pulls and a run hit `toomanyrequests` on four images at once.

**They sign in for real**, through Mailpit, because sign-in is the flow most
worth covering and stubbing it would test the stub. `e2e/mailpit.ts` reads the
**text** part of the email — the HTML `href` escapes its separators as
`&amp;`, and following that string literally makes GoTrue read `amp;type`
instead of `type`, a 400 that looks exactly like an expired link.

Three things learned making them non-flaky, all of which will bite again:

- **`auth.email.max_frequency` is `1s` and is already its minimum**, so two
  sign-ins inside the same second collide with "you can only request this
  after 0 seconds". `requestLink()` retries around it rather than pretending
  the limit is not there. The hourly `email_sent` cap was raised from **2** to
  100 for local development — 2 exhausts within one test run, and then every
  further sign-in fails in a way that reads as a broken link.
- **Next renders an always-present empty `role="alert"`** (the route
  announcer), so an unscoped `getByRole('alert')` is ambiguous or matches
  nothing useful. Scope to `main` or to the form.
- **A test that writes must restore the seed.** `resetSeed()` runs
  `supabase db reset` in `beforeAll`, because a suite that passes once and
  then fails on its own leftovers is the flakiness that gets a suite ignored.
  Ordering within a file matters: the mutating test goes last.

The first run found a **real bug that had never been caught**:
`GET /invoices/:id` returns the invoice flat, like every other detail route,
but `api.ts` declared `{ invoice, lineItems, client }` — so
`data.invoice.status` threw and *every invoice detail page* rendered the error
boundary. Download, send, void and delete were all unreachable. Nothing else
could have caught it: the route tests never render, and jsdom's fetch is
stubbed with whatever shape the test author believed.

### UI tests

`pnpm test:ui` — Vitest + Testing Library in jsdom, `test/ui/*.test.tsx`.
Separate from `pnpm test` (route handlers against real Postgres under
`node --test`); the Vitest config never picks those up.

jsdom lacks the APIs Radix's popper needs, so `test/ui/setup.ts` shims
`ResizeObserver`, `DOMRect` and the pointer-capture methods. Without them
every DropdownMenu test throws on open.

`userEvent.setup()` returns the instance synchronously — it is not a promise.

`test/ui/appearance.test.tsx` covers the design rules that fail **silently**:
white-on-accent, the accent appearing on a stopped or runaway timer, an accent
focus ring, a component hand-rolling type instead of naming a role, and a
`type-*` that is not a real role. Each assertion was verified to fail when the
rule is broken — a colour-pairing test that cannot fail is decoration.

**Do not add computed-style assertions.** jsdom cannot parse Tailwind 4's
compiled output (`@layer`, `@property`, `oklch()`, nested `@media`) and
silently drops what it does not understand, so `getComputedStyle` returns
browser defaults — 16px, black — for every one of our utilities. Injecting the
real `.next` CSS was tried and resolves nothing. A suite built on it would
pass while proving nothing; real pixels need a browser.

These tests assert *rules*, not class strings. `toHaveClass('type-nav')` on
its own restates the source and fails on any edit, which is a change detector
rather than a test.

### The timer

`useTimer` counts locally from `startedAt` and reconciles with `/summary`
every 60s and on focus. `serverTime` corrects for a skewed device clock.

Before hydration it counts from the server's timestamp, not `Date.now()` —
otherwise SSR and the client render different seconds and React reports a
hydration mismatch.

Today's total subtracts the running timer's elapsed-at-fetch before adding
the live count, or the running time is counted twice.
