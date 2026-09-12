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

**The accent (green `#52FC43`) marks the primary action on a screen, and
inside the app that is the running timer.** At most one accent *meaning* in
view. Not navigation, not secondary buttons, not links, never decoration.
On a screen with no timer (sign-in, an empty state), the one thing the user
came to do may carry it. Green never means success — success is cyan
`#2CCCEB`.

The nav readout (`nav-timer.tsx`) is green on every screen including the
timer screen, where the hero is also green. Both are the same fact, so they
reinforce; the rule forbids green meaning several different things at once,
not one thing shown twice.

**Never white text on the accent** — 1.37:1. Use `--text-on-accent`. CI guards
this specific regression.

**Focus rings are neutral, never the accent.** `border-focus` is `n-700`. A
focus ring is constant and involuntary; spending the accent there drowns the
one signal it exists for.

**Content floats, chrome recedes.** The body is `--bg-base` (the darkest
surface) and panels sit above it on `bg-surface-primary` with `shadow-card`.
Never invert this — cards darker than the ground read as holes. Depth comes
from shadow and radius because `bg-base`→`bg-primary` is only 1.03:1; see
`docs/design/color.md`.

## Conventions

- **No Server Actions** for anything Expo or Swift also needs. Everything goes
  through `/api/v1/*` route handlers.
- Colors come from **semantic** tokens only. Primitives stay in the token
  package. Never hardcode a hex in a component.
- Design tokens are **generated** — edit `packages/design-tokens/tokens.json`,
  then `pnpm tokens`. Never edit files in `dist/`.
- The neutral ramp itself is **derived**, not hand-picked: change the floor or
  curve in `src/derive-neutrals.mjs` and paste its output. Never eyedrop a
  grey. `src/oklch.mjs` holds the OKLCH↔sRGB maths with gamut mapping.
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@stint/core`) so
  a retried insert is idempotent — the same id lands on the same row.
- Rate resolution exists in SQL (authoritative) and TS (previews). Keep them in
  sync; the database wins.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

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
- `errors.ts` — `handle()` wraps every route; `ApiError` maps to documented
  status codes. Contains a compile-time guard asserting the local `Code` union
  matches `ErrorCode` in `@stint/schema`.
- `rows.ts` — **the only place that knows both snake_case and camelCase.**
  Rename a column here, nowhere else.
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

## Docs

`docs/api.md` marks unimplemented endpoints **(not implemented)** — there are
none right now. Keep that honest: the audit that produced this section found
docs describing planned work as built, which is worse than no docs.

**The app is online-only.** There is no outbox and no `POST /sync`; both were
removed as unused. `docs/architecture.md` records why, and why a sync engine
still would not be the answer if offline ever comes back.

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

### The calendar

A week grid of what was tracked. It visualises, it does not schedule — no
planned layer, no external calendar.

**Never step days or weeks with `+ 86_400_000`.** Use
`startOfLocalDayOffset` (negative `daysBack` steps forward): a week
containing a DST transition is 167 or 169 hours, and a fall-back day is 25
hours long, so fixed-millisecond arithmetic lands an hour off and mis-buckets
the entries at the edges. Block positions divide by the column's own span for
the same reason.

Overlapping entries get side-by-side lanes rather than stacking — in a
billing tool a block you cannot see is a block you cannot check. Tested, and
the test was verified to fail when the laning is removed.

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

### UI tests

`pnpm test:ui` — Vitest + Testing Library in jsdom, `test/ui/*.test.tsx`.
Separate from `pnpm test` (route handlers against real Postgres under
`node --test`); the Vitest config never picks those up.

jsdom lacks the APIs Radix's popper needs, so `test/ui/setup.ts` shims
`ResizeObserver`, `DOMRect` and the pointer-capture methods. Without them
every DropdownMenu test throws on open.

`userEvent.setup()` returns the instance synchronously — it is not a promise.

### The timer

`useTimer` counts locally from `startedAt` and reconciles with `/summary`
every 60s and on focus. `serverTime` corrects for a skewed device clock.

Before hydration it counts from the server's timestamp, not `Date.now()` —
otherwise SSR and the client render different seconds and React reports a
hydration mismatch.

Today's total subtracts the running timer's elapsed-at-fetch before adding
the live count, or the running time is counted twice.
