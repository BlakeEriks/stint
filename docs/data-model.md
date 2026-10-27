# Data Model

Hierarchy: **Client → Project → Time Entry**, and **Client → Expense** for
costs the client reimburses.

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
  that matters most. `ProjectRate` prints the same figure on `/clients`.
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

  **`unbilled_by_client`, `revenue_by_day` and `revenue_by_client` count a
  running entry** up to a trailing `p_now` (default `now()`), measured by
  `entry_seconds()` (`00000000000031_live_running_entry.sql`), so Home and the
  menu bar move with a timer. The route passes the instant it cuts its windows
  at. `month_revenue` and `revenue_by_project` still skip a running entry; no
  screen reads them.

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

**Rates are frozen onto invoice line items when it is sent.** A draft shows
current rates until then; changing a client's rate next year must never
retroactively alter an invoice already sent.

## Tables

### `user_settings`
One row per user, auto-created by a trigger on `auth.users` insert. Holds the
global rate fallback, display preferences, the invoice
identity block (business name, address, logo), `payment_terms_days`
(0–365, default 30), the invoice number sequence, `payment_notice`, and the entry-length thresholds
(`min_entry_seconds`, `max_entry_hours`).

**`legacy_payment_terms` is free text the move to days couldn't read**,
kept until the user saves their terms so the Inbox can quote it;
`legacy_payment_terms_days()` is the rule that read the rest, kept for its
test.

**`welcomed_at` is null until the welcome dialog is finished or skipped**,
and null is what shows it. The signup trigger leaves it null; every account
that existed before the dialog was backfilled as welcomed.

**`max_entry_hours` defaults to 12; `min_entry_seconds` to null.** The long
side is how a timer left running overnight reaches the inbox once it is
stopped. Null retires that side of the strange-duration row. Seconds on the
short side: an entry under a minute was started and stopped without work
between it.

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
`billing_period` is how often its contract bills it, null for no schedule;
weekly and biweekly count from `period_anchor`, which the
`billing_period_anchor` check requires for them and refuses for the others.
A new invoice's period defaults from it, and one off the schedule is hinted
at, never refused. `payment_terms_days` overrides the user's; null uses
theirs.

### `projects`
`client_id` is **nullable** — that is how internal/unbilled work is modeled.
A project has no color; it takes its client's.

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

`routing_number` holds exactly 9 digits (`payment_profiles_routing_number_digits`).
The ABA checksum is checked only by `validateRoutingNumber()` in `@stint/core`,
which the API runs on every write.

The invoice freezes the profile picked on New invoice; a pick archived or
gone is refused, never swapped. Without a pick, resolution mirrors rates: the
client's `payment_profile_id`, else the user's default, and a dangling client
reference falls back rather than rendering nothing.

### `invoices` / `invoice_line_items`
Line items are **denormalized on purpose**. An issued invoice is an immutable
financial record, not a live view over time entries.

**A draft is the user's choices; its lines are derived on read** (#452). It
stores grouping, summary text, reference, notes, a typed due date,
payment details, the supporting-detail kinds, its `fixed` lines, `tz` (the
zone its period's dates are read in) and `excluded_expense_ids` (the expenses
left off). `payment_terms` keeps its terms (`Net N`, or `Due on receipt`) from
the client's days, else the user's, as Generate found them. Its time and
expense lines, totals, issue date and, unless typed, due date are computed on
every read and written by nothing; no entry or expense points at a draft.
`downloaded_snapshot` is what its PDF last showed, dates included, which
sending keeps; it is the one column a read writes. Mark sent refuses with
`DRAFT_CHANGED` while the draft differs from it. **Mark sent is
`send_draft()`**: it writes the lines and totals the route computed, claims
the entries and one-off expenses, sets `issue_date`, `due_date` and the
`payment_terms` they make (the last PDF's, else the send date's), and sends, in one transaction. An entry or
expense another invoice took meanwhile raises `ENTRY_ALREADY_INVOICED` or
`EXPENSE_ALREADY_INVOICED` and rolls it all back.

`payment_details` (JSONB) freezes the rendered bank details at generation, for
the same reason rates freeze: editing a profile must never alter an invoice
already sent. `supporting_detail` (JSONB) holds the hours-by-project, -week
and -date tables printed from page 2. A draft's are derived with its lines;
sending freezes them, so a renamed project or a void never changes them. The `business_*` and `logo_url` columns (the From
block) and the `client_*` columns (Bill to) are copied from `user_settings`
and the client by a trigger on insert, so editing either never reprints an
invoice. `summary_text` is the line text of a `summary`
invoice and is set exactly then; `reference` is the PO, contract or SOW the
header prints. `issued_subscription_status` is the user's `subscriptions.status`
when the invoice was inserted, copied by a trigger whatever the insert says
and never changed after, so an invoice generated while paying keeps its PDF
when the paid plan ends (`documentOpens()` in `@stint/core`).

**Three kinds of line, one arithmetic.** `unit` is `hour`, `fixed` (a fee, a
deposit, a retainer) or `expense` (a reimbursement), and every line is
`quantity × unit_price = amount`, to the cent. A time line's quantity is the
sum of its entries' hours, each rounded to two decimals first, so the invoice
bills exactly what it prints and its total is the same however the lines are
grouped. Every rollup prices the same per-entry hours
(`00000000000028_bill_printed_hours.sql`), which is what keeps the home
screen and the invoice on one figure. An expense line is one of something, like a
fee, and is the only kind carrying `spent_on`. `subtotal` is the **services**
subtotal — time and fees — and the base tax is charged on; the reimbursements
sit in `expenses_subtotal`, never taxed, and `total = subtotal + tax_amount +
expenses_subtotal`.

**Generation is one transaction.** `create_invoice()` allocates the number
and writes the draft and its charges; it computes nothing itself, except the
payment reference it appends to the frozen payment block once the number
exists. One open draft per client and date: after the number's allocation
has taken the user's counter row lock, it raises `DRAFT_OVERLAPS` for a draft
over any of the period, so of two concurrent Generates the second fails and
rolls back, never using up a number.

### `expenses`
A cost the contractor paid that a client reimburses. It has an amount and no
duration, so it lives apart from `time_entries`: the timer index, the rate
chain and every earned and unbilled rollup read that table, and none of them
should count a reimbursement as work. The amount is in the client's currency;
there is no currency column, because an expense is never converted.

- `client_id` is required, and references its row **with `user_id`**, as
  `time_entries.project_id` does.
- `invoice_id` set means billed, by a sent invoice. A one-off shows on one
  open draft for its client: the one whose period ends first on or after its
  date (`assignExpenses`), so one missed invoice does not strand a
  reimbursement.
- `recurring` bills it on **every** invoice for the client instead of once: a
  subscription the client reimburses. It has no `spent_on`
  (`expense_dated`), is never attached (`recurring_never_billed`), and so is
  never locked or released. Each invoice freezes its own line, dated the
  period's end; editing or deleting it reaches only later invoices.
- Unbilled expenses count toward neither **earned** nor **unbilled**, which
  are readings about work. They reach **awaiting** and **collected** through
  the invoice's `total`.

### `feedback`
A message a user sent from the app's Feedback button, with the `screen` path,
the `client` (`web` or `macos`) and the `app_version` it came from. It is
written once: `authenticated` is granted only `select` and `insert`, so a
sent message can't be changed or deleted, even by its sender. It goes with the
account (`on delete cascade`). The checks match `CreateFeedback`: `message`
1–2,000 characters, `screen` 1–200, `app_version` 1–64.

### `push_devices`
The phones a user's timer changes are pushed to (`apps/web/src/lib/push.ts`):
`user_id`, the provider's `token`, the `platform` (`android`) and
`created_at`, keyed on `(user_id, token)`. `authenticated` may select,
insert and delete its own rows; a new token is a new row, so there is no
update grant. A token can sit under two accounts when a sign-out didn't
reach the server, which leaks nothing: the push carries no data. It goes
with the account (`on delete cascade`).

### `subscriptions`
A mirror of the user's Stripe subscription, one row per user, keyed on
`user_id`: the Stripe customer and subscription, Stripe's `status`, the
`current_period_end` it renews or ends at, and `cancel_at_period_end`. Stripe
is the source of truth: only the server writes it, as `service_role`, from
Stripe's current record (`syncCustomer()`, `apps/web/src/lib/billing.ts`).
`authenticated` may only `select` its own row, so no client can make itself
paid. Whether a status is paid is `planOf()` in `@stint/core`, not SQL. It
goes with the account (`on delete cascade`), after `DELETE /account` has
canceled any live subscription at Stripe.

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

### Issued invoices are immutable
Once an invoice leaves `draft`, `guard_issued_invoice` refuses a change to
any column but `status`, `sent_at` and `paid_at`, and moves `status` only
along draft→sent/void, sent→paid/void, paid→void. `guard_issued_line_item`
refuses inserting, editing or deleting one of its lines; the lines go only
with the invoice, by cascade. `guard_issued_invoice_delete` refuses
deleting it for `authenticated`, so the number stays on record. Voiding releases the invoice's entries and
expenses in the voiding update itself (`release_voided_invoice`).

### Billed entries are immutable
A trigger blocks edits and deletes once an entry belongs to a **non-draft**
invoice. The guarded fields are `started_at`, `ended_at`, `is_billable`,
`rate_override`, `project_id` **and `task_name`** — the last because the task
name becomes the invoice line description, so editing it after issue changes
what the client was told they were billed for, even when the money is
unchanged.

No entry or expense points at a draft, so only sent work is locked.
**Detaching** an entry (`invoice_id → null`) stays allowed, so a voided
invoice can release its entries.

`guard_billed_expense` holds the same lock on an expense, over `spent_on`,
`description`, `amount`, `client_id` and `recurring`, with the same
exception. An edit to unbilled work shows on the next read of any draft.

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
The user may move `next_invoice_number` forward, to start past invoices sent
before Stint, and never back (`PATCH /settings`).

### Other constraints
- `ended_at is null or ended_at > started_at`.
- `invoice_number` and `sequence_no` unique per user.
- Enumerations are check constraints, not conventions: `status`,
  `grouping_mode`, `time_format`, `account_type`, `fee_allocation`,
  `monthly_target_unit`.
- Ranges: `week_starts_on` 0–6, `tax_rate` 0–100,
  `min_entry_seconds > 0`, `max_entry_hours > 0`,
  `next_invoice_number > 0`, `monthly_target > 0`,
  `quantity_seconds >= 0`; client, project and payment-profile names must be
  non-blank, and an invoice's period must be ordered.
- `payment_profiles_routing_number_digits`: `routing_number ~ '^[0-9]{9}$'`.
- **Paired nullability is a constraint too**: `monthly_target_needs_unit`
  asserts `(monthly_target is null) = (monthly_target_unit is null)`, so a
  target can never exist without the unit that gives it meaning, and
  `paid_has_paid_at` asserts `status <> 'paid' or paid_at is not null`. The
  column stays nullable — a draft legitimately has no payment date — and
  `void` is exempt, since an invoice can be voided from any state. Collected
  is derived from `paid_at`, so a paid row without one drops a real payment
  out of the figure that says what arrived.
- `updated_at` is maintained by a `touch_updated_at` trigger on every table
  **except `invoice_line_items`, `feedback` and `push_devices`**, which have
  no such column: each is written once and never edited, so a "last
  modified" timestamp would be a field that can only ever lie.
  `subscriptions` has the column but no trigger: its one writer, the Stripe
  sync's upsert in `apps/web/src/lib/billing.ts`, sets it.
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

One table is written outside RLS: `subscriptions` grants `select`, `insert`
and `update` to `service_role`, which bypasses RLS. Only `serviceClient()`
(`apps/web/src/lib/supabase.ts`) uses that role, from `syncCustomer()`, for
the Stripe webhook and the Checkout return.

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
- Changing a **non-draft** invoice or its lines is rejected, and its status
  moves only along the transition table, whichever client writes it.
- Detaching an entry from a voided invoice is allowed — that is the release
  path voiding depends on.
- Voiding releases what the invoice billed in the same statement.
- Rates are frozen onto line items when an invoice is sent: changing a
  client's rate later leaves an issued invoice at its original total.
- `send_draft` runs as the caller and refuses anything but the caller's own
  draft.
- Editing or deleting an expense billed to a **non-draft** invoice is
  rejected, and voiding releases it.
- A send that loses a race for an expense writes nothing.
- Two concurrent Generates over one client's dates make one draft.

### RLS, verified against live policies

`apps/web/test/rls.test.ts` connects as a non-superuser `authenticated` role
with `request.jwt.claim.sub` set per transaction, exactly as PostgREST does,
so `auth.uid()` resolves and the policies actually run. The premise
throughout is that a route's own `user_id` filter has been dropped — RLS
alone must still contain the query.

| Check | Result |
|---|---|
| An unfiltered `select` returns only the caller's rows | isolated |
| All ten user-scoped tables isolate | isolated |
| A known-good id belonging to another user returns nothing | no leak |
| Line items inherit isolation through their invoice | isolated |
| Insert with a forged `user_id` | rejected by `WITH CHECK` |
| Update or delete targeting another user's row | matches nothing |
| Reassigning a row to another user | rejected by `WITH CHECK` |
| Changing or deleting sent feedback, even your own | refused by the grant |
| Writing any subscription, your own included | refused by the grant |
| Registering a phone to another user, or changing a registered one | rejected by `WITH CHECK`, refused by the grant |
| Claiming or changing the plan an invoice was generated on | overwritten at insert, refused on update |
| An expense filed under another user's client | rejected by `expense_client_same_owner` |
| An invoice billed to another user's client | rejected by `invoice_client_same_owner` |
| A project under another user's client | rejected by `project_client_same_owner` |
| An unqualified `delete from time_entries` | removes only the caller's |
| Two users may each run a timer; neither may run two | per-user, as designed |
| No JWT claim, or a malformed one | fails closed |

The suite guards itself: `before` asserts the role is neither a superuser nor
`BYPASSRLS`, since either would make every assertion pass vacuously. Both
failure modes were checked by inducing them — disabling RLS on one table, and
granting `BYPASSRLS` — and the suite goes red for each.
