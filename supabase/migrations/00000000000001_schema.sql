-- ═══════════════════════════════════════════════════════════════════
-- Foundation schema. Hierarchy: Client -> Project -> Time Entry.
--
-- Two rules carry the whole design:
--   1. At most one running timer per user, enforced by the DATABASE.
--   2. An issued invoice is immutable, and so are the entries it bills.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── settings ───────────────────────────────────────────────────────
create table user_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,

  default_hourly_rate   numeric(12,2),
  currency              char(3)     not null default 'USD',
  week_starts_on        smallint    not null default 1 check (week_starts_on between 0 and 6),
  time_format           text        not null default '24h' check (time_format in ('12h','24h')),

  -- Runaway timer protection. The app NEVER auto-edits an entry; it only
  -- surfaces that the threshold was crossed and lets the user decide.
  max_timer_hours       numeric(4,1) not null default 8 check (max_timer_hours > 0),

  -- Invoice identity
  business_name         text,
  business_address      text,
  business_email        text,
  logo_url              text,
  tax_id                text,
  default_payment_terms text        not null default 'Net 30',
  invoice_number_prefix text        not null default 'INV-',
  next_invoice_number   integer     not null default 1 check (next_invoice_number > 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── clients ────────────────────────────────────────────────────────
create table clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  email        text,
  address      text,
  hourly_rate  numeric(12,2),          -- null -> fall back to user default
  tax_rate     numeric(5,2) check (tax_rate >= 0 and tax_rate <= 100),
  currency     char(3),                -- null -> fall back to user default
  color        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index clients_user_active_idx on clients (user_id) where archived_at is null;

-- ── projects ───────────────────────────────────────────────────────
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  client_id          uuid references clients(id) on delete set null,  -- null = internal work
  name               text not null check (length(trim(name)) > 0),
  hourly_rate        numeric(12,2),    -- null -> fall back to client rate
  color              text,
  is_billable_default boolean not null default true,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index projects_user_active_idx on projects (user_id) where archived_at is null;
create index projects_client_idx on projects (client_id);

-- ── invoices ───────────────────────────────────────────────────────
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete restrict,

  invoice_number text not null,        -- rendered, e.g. 'INV-0001'
  sequence_no    integer not null,     -- numeric part, for gapless ordering
  status         text not null default 'draft'
                 check (status in ('draft','sent','paid','void')),

  issue_date     date not null default current_date,
  due_date       date,
  period_start   date,
  period_end     date,

  -- Frozen totals. An issued invoice is a financial record, not a view.
  subtotal       numeric(12,2) not null default 0,
  tax_rate       numeric(5,2)  not null default 0,
  tax_amount     numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  currency       char(3) not null default 'USD',

  notes          text,
  payment_terms  text,
  grouping_mode  text not null default 'entry'
                 check (grouping_mode in ('entry','task','project','day')),

  sent_at        timestamptz,
  paid_at        timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint invoice_number_unique_per_user unique (user_id, invoice_number),
  constraint invoice_sequence_unique_per_user unique (user_id, sequence_no),
  constraint period_ordered check (period_end is null or period_start is null or period_end >= period_start)
);
create index invoices_user_status_idx on invoices (user_id, status);

-- ── time entries ───────────────────────────────────────────────────
create table time_entries (
  -- UUIDv7 generated by the CLIENT, so a retried insert is idempotent:
  -- the same id lands on the same row rather than duplicating it.
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,

  task_name     text not null default '',
  started_at    timestamptz not null,
  ended_at      timestamptz,          -- NULL == running
  is_billable   boolean not null default true,
  rate_override numeric(12,2),        -- highest-precedence rate

  invoice_id    uuid references invoices(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint entry_ends_after_start check (ended_at is null or ended_at > started_at)
);

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  THE TIMER INVARIANT                                          ║
-- ║  At most one running entry per user. Overlap is made          ║
-- ║  structurally impossible rather than cleaned up later.        ║
-- ╚═══════════════════════════════════════════════════════════════╝
create unique index one_running_timer_per_user
  on time_entries (user_id)
  where ended_at is null;

create index entries_user_started_idx on time_entries (user_id, started_at desc);
create index entries_invoice_idx on time_entries (invoice_id);
create index entries_unbilled_idx on time_entries (user_id, project_id)
  where invoice_id is null and is_billable;

-- Duration as a generated column: never stored independently, so it
-- cannot drift from started_at/ended_at.
alter table time_entries
  add column duration_seconds integer
  generated always as (
    case when ended_at is null then null
    else extract(epoch from (ended_at - started_at))::integer end
  ) stored;

-- ── invoice line items ─────────────────────────────────────────────
-- Denormalized ON PURPOSE. Changing a client's rate next year must not
-- retroactively alter an invoice that was already sent.
create table invoice_line_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references invoices(id) on delete cascade,
  description      text not null,
  quantity_seconds integer not null check (quantity_seconds >= 0),
  resolved_rate    numeric(12,2) not null,   -- frozen at generation time
  amount           numeric(12,2) not null,
  sort_order       integer not null default 0
);
create index line_items_invoice_idx on invoice_line_items (invoice_id, sort_order);
