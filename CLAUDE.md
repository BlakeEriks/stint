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
- Durations are always mono + `tabular-nums`.
- Time entry ids are **client-generated UUIDv7** (`uuidv7()` in `@tt/core`) so
  offline retries are idempotent.
- Rate resolution exists in SQL (authoritative) and TS (previews). Keep them in
  sync; the database wins.
- `0` is a valid rate. Use null-coalescing, never truthiness.
- Archive, don't delete — invoices reference clients and projects.

## Verifying the schema

No Supabase CLI installed. To test migrations, start a throwaway Postgres
(`/opt/homebrew/opt/postgresql@14/bin`) on a spare port over TCP — the socket
path in the scratchpad exceeds the 103-byte limit — stub `auth.users` and
`auth.uid()`, apply both migrations, then tear it down.

## API layer

All routes live in `apps/web/src/app/api/v1/`. Shared plumbing in
`apps/web/src/lib/`:

- `auth.ts` — `requireSession()` accepts both a bearer token (Expo, macOS) and
  a cookie session (web); both yield an RLS-scoped client.
- `errors.ts` — `handle()` wraps every route; `ApiError` maps to documented
  status codes. Contains a compile-time guard asserting the local `Code` union
  matches `ErrorCode` in `@tt/schema`.
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
- `buildPaymentDetails` in `@tt/core` drops unset fields entirely — never
  render an empty label, and never an empty section header.
- The PDF payment block is `wrap={false}`: a stranded "Payment" header with
  the account numbers overleaf is the one page break that actually harms the
  reader.

## Docs

`docs/api.md` marks unimplemented endpoints **(not implemented)** — currently
`POST /sync`. Keep that honest: the audit that produced this section found
docs describing planned work as built, which is worse than no docs.

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
