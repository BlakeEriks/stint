# Data Model

Hierarchy: **Client → Project → Time Entry**

Schema lives in `supabase/migrations/`. Every rule below is enforced by the
database, not by convention.

## Rate resolution

```
entry.rate_override
  → project.hourly_rate
    → client.hourly_rate
      → user_settings.default_hourly_rate
```

Implemented **twice**, once per language:

- `resolveRate()` in `packages/core/src/rates.ts` — **this is what actually
  bills.** `POST /invoices` builds line items in memory and writes
  `resolved_rate` from the value TypeScript computed. The preview and the
  issued invoice therefore come from identical code, which is the property
  that matters most. `ProjectRate` prints the same figure on `/projects`.
- `resolve_rate(numeric, numeric, numeric, numeric)` in SQL
  (`00000000000010_one_rate_chain.sql`) — the chain over the four columns,
  called by `resolve_entry_rate(uuid)` for a single entry and once per row in
  the joins of every rollup that reports money from work: `unbilled_by_client`,
  `month_revenue`, `revenue_by_day`, `revenue_by_client` and
  `revenue_by_project`. It is `immutable` and carries no `search_path`, so
  Postgres inlines it and the rollups plan as the plain `COALESCE` they used
  to spell out. `collected_by_month` is the one rollup that does not call it —
  a payment is a fact about an issued document, so it sums the invoice's own
  `total`, grouped by month **and by currency**, because money is not addable
  across them and one `sum` over a mixed month reports a number of nothing.
  Picking which currency the screen shows is the caller's, as it is for
  `revenue_by_client` and `revenue_by_project`.

  **Each rollup owns its window, and `/stats` reports them rather than
  choosing them.** `unbilled_by_client` groups by (client, rate) and reports a
  client-less row as "No client". `revenue_by_client` and
  `revenue_by_project` run the trailing **three whole months**, splitting
  gross work done into `invoiced` and `unbilled`, which sum to the total;
  because that window opens on the 1st three months back, their unbilled
  figure parts from `unbilled_by_client` only when work has gone unbilled past
  that boundary. `revenue_by_project` is the one rollup counting **unbillable
  work** in its seconds — the hours reading answers where the time went, while
  the money columns stay billable-only. `collected_by_month` runs twelve whole
  months. A per-month average is divided **on the server**; no client divides
  money.

**`apps/web/test/rates.test.ts` is what keeps them in step.** It builds every
combination of the four levels being unset, `0`, or a distinct rate, and
asserts that SQL and TypeScript resolve each entry identically and that both
rollups' totals equal what `buildLineItems` produces. Neither side is
authoritative on its own; the test is. Without it a change to one language is
invisible to the other, and the home screen disagreeing with an invoice
preview about the same work is what that produces.

**`0` is a real rate, not an absent one.** A project deliberately set to 0 (pro
bono) does not fall through to the client's rate. Both implementations use
null-coalescing, never truthiness.

**Rates are frozen onto invoice line items at generation time.** Changing a
client's rate next year must never retroactively alter an invoice already sent.

## Tables

### `user_settings`
One row per user, auto-created by a trigger on `auth.users` insert. Holds the
global rate fallback, display preferences, `max_timer_hours`, the invoice
identity block (business name, address, logo, tax id, terms), the invoice
number sequence, `payment_notice`, and the entry-length thresholds
(`min_entry_seconds`, `max_entry_hours`).

**The length thresholds default to null, and that is the feature.** Null
retires that side of the inbox's strange-duration row, so an existing account
gains no new row until it asks for one. Seconds on the short side: an entry
under a minute was started and stopped without work between it.

**The trigger is `security definer` with `set search_path = public, pg_temp`,
and both halves matter.** It fires inside Supabase's signup transaction, so
anything it raises rolls the whole signup back and the client sees only
`unexpected_failure` / "Database error saving new user" — the useful error is
swallowed by the Auth service. Definer gives it the owner's privileges; the
pinned path resolves `user_settings` regardless of the caller's own search
path, and the caller is `supabase_auth_admin`, which does not have `public` on
it. **Any future definer function needs the same treatment.**

### `clients`
Billing entity. `hourly_rate`, `tax_rate` and `currency` are all nullable —
null means "fall back". `color` is here because color identifies a client.

### `projects`
`client_id` is **nullable** — that is how internal/unbilled work is modeled.
`color` is **dead but not doomed**: nothing selects or writes it, and a
project takes its color from its client. Its drop is canceled —
`roadmap.md` revives it as a shade index within the client's hue, which is an
`alter type` to `smallint` rather than a drop and re-add.

### `time_entries`
- `id` is **UUIDv7 generated by the client**, so a retried insert is idempotent.
- `ended_at IS NULL` means **running**.
- `duration_seconds` is a **generated column** — never stored independently, so
  it cannot drift from `started_at`/`ended_at`.
- `invoice_id` set means the entry is billed.
- `duration_ok` is the user's **answer** to "is this length correct?", and the
  one piece of stored judgment on an entry — `duration_seconds` beside it is
  derived. A trigger clears it whenever `started_at`/`ended_at` change, so the
  answer cannot outlive the length it was given about.

### `payment_profiles`
A named bundle of bank details, rendered on the invoice PDF. **US-first**:
account number + ACH routing is the default path; IBAN/SWIFT, a labeled
national bank code, and intermediary-bank fields are additive and render only
when set.

Resolution mirrors rates: the client's `payment_profile_id`, else the user's
default. A dangling reference falls back rather than rendering nothing.

### `invoices` / `invoice_line_items`
Line items are **denormalized on purpose**. An issued invoice is an immutable
financial record, not a live view over time entries.

`payment_details` (JSONB) freezes the rendered bank details at generation, for
the same reason rates freeze: editing a profile must never alter an invoice
already sent.

## Integrity rules

### The timer invariant
```sql
create unique index one_running_timer_per_user
  on time_entries (user_id) where ended_at is null;
```
A second concurrent start is rejected by the database itself. The API returns
`409 TIMER_ALREADY_RUNNING` with the running entry attached.

### The default-profile invariant

```sql
create unique index one_default_payment_profile_per_user
  on payment_profiles (user_id)
  where is_default and archived_at is null;
```

Structurally the same trick, for the same reason: **one default per user,
enforced by an index rather than by code that checks first.** A pre-check is a
race; a partial unique index is not. The first profile a user creates becomes
the default automatically.

**The index stops two defaults; it cannot stop zero, and zero is the one that
costs money.** With no default, `loadPaymentProfile` resolves to null and the
next invoice renders with no bank details at all — valid, silent, and already
sent by the time anyone notices. So the routes hold the other half:
`PATCH` refuses to demote the last live profile, and archiving the default
hands it to a survivor. Both are covered in `invoices.test.ts`.

### Billed entries are immutable
A trigger blocks edits and deletes once an entry belongs to a **non-draft**
invoice. The guarded fields are `started_at`, `ended_at`, `is_billable`,
`rate_override`, `project_id` **and `task_name`** — the last because the task
name becomes the invoice line description, so editing it after issue changes
what the client was told they were billed for, even when the money is
unchanged.

Two deliberate exceptions:

- Entries on a **draft** invoice remain editable.
- **Detaching** an entry (`invoice_id → null`) stays allowed, so a voided
  invoice can release its entries.

### Work invoiced elsewhere
`time_entries.invoiced_elsewhere` marks work already billed from another tool,
usually history an import brought in. It counts as **earned** and is never
**unbilled**: `unbilled_by_client`, invoice generation and the inbox's
uninvoiced rows all skip it. It is a flag, not an invoice, so it takes no
number and appears in no invoice list, and the entry stays editable.

### Gapless invoice numbering
`allocate_invoice_number(user_id)` increments `next_invoice_number` under a row
lock and returns both the numeric sequence and the rendered string
(`INV-0001`). The lock serializes concurrent callers, which is what makes the
sequence gapless under concurrency rather than merely usually correct.

### Other constraints
- `ended_at is null or ended_at > started_at`.
- `invoice_number` and `sequence_no` unique per user.
- Enumerations are check constraints, not conventions: `status`,
  `grouping_mode`, `time_format`, `account_type`, `fee_allocation`,
  `monthly_target_unit`.
- Ranges: `week_starts_on` 0–6, `tax_rate` 0–100, `max_timer_hours > 0`,
  `min_entry_seconds > 0`, `max_entry_hours > 0`,
  `next_invoice_number > 0`, `monthly_target > 0`,
  `quantity_seconds >= 0`; client, project and payment-profile names must be
  non-blank, and an invoice's period must be ordered.
- **Paired nullability is a constraint too**: `monthly_target_needs_unit`
  asserts `(monthly_target is null) = (monthly_target_unit is null)`, so a
  target can never exist without the unit that gives it meaning, and
  `paid_has_paid_at` asserts `status <> 'paid' or paid_at is not null`. The
  column stays nullable — a draft legitimately has no payment date — and
  `void` is exempt, since an invoice can be voided from any state. Collected
  is derived from `paid_at`, so a paid row without one drops a real payment
  out of the figure that says what arrived.
- `updated_at` is maintained by a `touch_updated_at` trigger on every table
  **except `invoice_line_items`**, which has no such column: a line is frozen
  at generation and never edited, so a "last modified" timestamp would be a
  field that can only ever lie.
- Partial indexes back the hot paths: active clients, projects and profiles,
  unbilled entries, and `invoices_user_paid_at_idx` on `(user_id, paid_at)`
  where the invoice is paid — payments are read by date, not by the status
  an existing index already covers. Entries by user and start time is a plain
  index — every entry is a candidate there.
- RLS on every table: `user_id = auth.uid()`; line items inherit from invoice.
  The route tests disable RLS (their subject is route logic);
  `apps/web/test/rls.test.ts` covers it against live policies.

### GRANT and RLS are two layers, and both are load-bearing

`00000000000004_api_grants.sql` grants table privileges to `authenticated` and
nothing to `anon`. **GRANT decides whether the role may touch the table at
all; RLS decides which rows it sees once it may.** Enabling RLS on a new table
without granting it produces a `42501` that looks nothing like a policy
problem.

Supabase's **"Automatically expose new tables" must stay OFF** — the grants
are explicit here so that a new table is unreachable until someone decides
what may reach it. `pnpm verify:schema` is the real control: it asserts every
table has RLS on and at least one policy, because RLS with no policies denies
everything and is indistinguishable from a broken deploy until someone tries
to read.

### One safety net exists only on production

An event trigger, `rls_auto_enable()`, fires on every `CREATE TABLE` in
`public` on the hosted project and enables RLS on the new table. **No
migration creates it**, so it is invisible from a checkout and absent from
local and CI databases.

It is a backstop, not a mechanism to build on. It cannot write policies, and
by the paragraph above a table with RLS and no policy denies everything — so
a table it "rescues" is still broken, just differently. Every table declares
its own `enable row level security` and at least one policy in its migration,
and `verify:schema` is what actually enforces that.

Worth knowing when reading the schema: an event-trigger function carries no
explicit grant and needs none, because privilege is not consulted when one
fires. `verify:schema`'s anon-execute check exempts them for the same reason
it exempts row triggers.

## What the database guarantees

These are enforced by the schema itself, so they hold no matter which client
writes — and each is covered by `apps/web/test/routes.test.ts` against a real
Postgres with the real migrations. The tests are the record of *whether* they
hold; this list is the record of *what* must.

- Settings are auto-created on user insert, by trigger.
- A second concurrent timer is rejected; stop-then-start is not.
- `duration_seconds` is generated, never written.
- `ended_at <= started_at` is rejected.
- Rate resolution walks all four levels, and `0` is a real rate.
- Invoice numbers are sequential and gapless under concurrency, because
  `allocate_invoice_number()` holds a row lock.
- A duplicate invoice number is rejected.
- Editing or deleting an entry billed to a **non-draft** invoice is rejected,
  including its `task_name` — that becomes the invoice line description, so
  changing it after issue rewrites what the client was told.
- Entries on a **draft** invoice stay editable; a draft holds no number and
  has been sent to nobody.
- Detaching an entry from a voided invoice is allowed — that is the release
  path voiding depends on.
- Rates are frozen onto line items at generation: changing a client's rate
  later leaves an issued invoice at its original total.

### RLS, verified against live policies

`apps/web/test/rls.test.ts` connects as a non-superuser `authenticated` role
with `request.jwt.claim.sub` set per transaction, exactly as PostgREST does,
so `auth.uid()` resolves and the policies actually run. The premise
throughout is that a route's own `user_id` filter has been dropped — RLS
alone must still contain the query.

| Check | Result |
|---|---|
| An unfiltered `select` returns only the caller's rows | isolated |
| All six user-scoped tables isolate | isolated |
| A known-good id belonging to another user returns nothing | no leak |
| Line items inherit isolation through their invoice | isolated |
| Insert with a forged `user_id` | rejected by `WITH CHECK` |
| Update or delete targeting another user's row | matches nothing |
| Reassigning a row to another user | rejected by `WITH CHECK` |
| An unqualified `delete from time_entries` | removes only the caller's |
| Two users may each run a timer; neither may run two | per-user, as designed |
| No JWT claim, or a malformed one | fails closed |

The suite guards itself: `before` asserts the role is neither a superuser nor
`BYPASSRLS`, since either would make every assertion pass vacuously. Both
failure modes were checked by inducing them — disabling RLS on one table, and
granting `BYPASSRLS` — and the suite goes red for each.
