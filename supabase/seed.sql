-- Seed data for local development. Runs on `pnpm dev:reset`.
--
-- Why this exists: an empty app is a poor test of a layout change. A nav
-- rail, a calendar week, an unbilled total and a status pill all look fine
-- with nothing in them — the bugs appear when there is real content of
-- varying length sitting in them.
--
-- LOCAL ONLY. `supabase/config.toml` sets db.seed.sql_paths, and the CLI runs
-- this against the local stack; nothing here ever reaches a real project.
--
-- Sign in as dev@localhost.test. `auth.email.enable_confirmations` is false
-- locally, so the magic link works immediately and is captured by Mailpit at
-- http://127.0.0.1:54324 rather than being sent anywhere.

-- ── the user ───────────────────────────────────────────────────────
-- Inserted directly rather than through the signup endpoint: signup sends a
-- confirmation email and there is no recipient. `create_default_settings`
-- fires on this insert, so the settings row appears exactly as it would for
-- a real signup — which is the code path that broke in production once.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@localhost.test',
  crypt('devpassword123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  -- GoTrue scans these into non-nullable Go strings, so a NULL here fails
  -- every lookup with "Database error finding user" and a 500 — the token
  -- columns must be empty strings, not NULL. The dashboard's own inserts do
  -- the same thing; it is only hand-written rows that hit this.
  '', '', '', ''
)
on conflict (id) do nothing;

-- US-based: USD, Net 30, no tax line. See the jurisdiction notes in CLAUDE.md.
update user_settings set
  default_hourly_rate   = 125.00,
  business_name         = 'Blake Eriks',
  business_address      = E'1 Market St\nSan Francisco, CA 94105',
  business_email        = 'dev@localhost.test',
  tax_id                = '00-0000000',
  invoice_number_prefix = 'STINT-',
  -- A target, so the Pace card has something to render. Hours rather than
  -- revenue because it is the easier one to sanity-check by eye against the
  -- seeded entries.
  monthly_target        = 120,
  monthly_target_unit   = 'hours'
where user_id = '00000000-0000-4000-8000-000000000001';

-- ── clients ────────────────────────────────────────────────────────
-- Colours are real palette entries from tokens.json, not eyedropped. Three
-- clients with different rate situations, because rate resolution is the
-- thing most worth seeing exercised: one overrides, one inherits the user
-- default, one is archived.
insert into clients (id, user_id, name, email, hourly_rate, currency, color, archived_at)
values
  ('00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-000000000001',
   'Northwind Trading', 'ap@northwind.test', 150.00, 'USD', '#6EA1E2', null),
  ('00000000-0000-4000-8000-0000000000c2',
   '00000000-0000-4000-8000-000000000001',
   'Byrne Studio', 'hello@byrne.test', null, 'USD', '#42B59A', null),
  ('00000000-0000-4000-8000-0000000000c3',
   '00000000-0000-4000-8000-000000000001',
   'Old Engagement Co', null, 95.00, 'USD', '#C984BA', now() - interval '60 days')
on conflict (id) do nothing;

-- ── projects ───────────────────────────────────────────────────────
-- No colour: colour identifies the client. One project has no client at all,
-- which is how internal/unbilled work is modelled, and it is the case that
-- renders with no colour rather than a shared grey.
insert into projects (id, user_id, client_id, name, hourly_rate, is_billable_default)
values
  ('00000000-0000-4000-8000-00000000a001',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000c1', 'Warehouse dashboard', null, true),
  ('00000000-0000-4000-8000-00000000a002',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000c1', 'Rush: peak season fixes', 195.00, true),
  ('00000000-0000-4000-8000-00000000a003',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000c2', 'Brand site rebuild', null, true),
  ('00000000-0000-4000-8000-00000000a004',
   '00000000-0000-4000-8000-000000000001',
   null, 'Stint itself', null, false)
on conflict (id) do nothing;

-- ── time entries ───────────────────────────────────────────────────
-- Relative to now(), so the calendar always has a populated current week
-- regardless of when the seed runs. Deliberately includes the cases that
-- break layouts:
--
--   * two entries that OVERLAP, so the calendar's lane assignment is
--     exercised rather than assumed
--   * a very long task name, which is what finds a missing truncation
--   * an empty task name, which must render as "Untitled" not as a blank
--   * non-billable work, which shows the badge and an em-dash rate
--   * entries at three different resolved rates, so an invoice preview has
--     more than one line and the "rate is part of the grouping key" rule is
--     visible
--
-- `duration_seconds` is a generated column, so it is never written here.
insert into time_entries (id, user_id, project_id, task_name, started_at, ended_at, is_billable, rate_override)
values
  -- today
  ('00000000-0000-7000-8000-0000000000e1',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a001',
   'Inventory sync edge cases',
   date_trunc('day', now()) + interval '9 hours',
   date_trunc('day', now()) + interval '11 hours 30 minutes', true, null),
  ('00000000-0000-7000-8000-0000000000e2',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a004',
   '', -- must render as "Untitled"
   date_trunc('day', now()) + interval '12 hours',
   date_trunc('day', now()) + interval '12 hours 25 minutes', false, null),

  -- yesterday, overlapping: the calendar must lane these side by side
  ('00000000-0000-7000-8000-0000000000e3',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a001',
   'Warehouse dashboard — filters',
   date_trunc('day', now()) - interval '1 day' + interval '10 hours',
   date_trunc('day', now()) - interval '1 day' + interval '13 hours', true, null),
  ('00000000-0000-7000-8000-0000000000e4',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a002',
   'Peak season hotfix, paged at lunch',
   date_trunc('day', now()) - interval '1 day' + interval '11 hours 30 minutes',
   date_trunc('day', now()) - interval '1 day' + interval '14 hours', true, null),

  -- earlier in the week, with the pathological label
  ('00000000-0000-7000-8000-0000000000e5',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003',
   'Rebuild the marketing site navigation, including the mobile drawer, the sticky header behaviour and every redirect from the old information architecture',
   date_trunc('day', now()) - interval '2 days' + interval '9 hours 15 minutes',
   date_trunc('day', now()) - interval '2 days' + interval '15 hours 45 minutes', true, null),
  ('00000000-0000-7000-8000-0000000000e6',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a003',
   'Typography pass',
   date_trunc('day', now()) - interval '3 days' + interval '13 hours',
   date_trunc('day', now()) - interval '3 days' + interval '17 hours', true, 140.00),

  -- last week, so "unbilled, oldest N days" has something to age
  ('00000000-0000-7000-8000-0000000000e7',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000a001',
   'Discovery call and notes',
   date_trunc('day', now()) - interval '9 days' + interval '10 hours',
   date_trunc('day', now()) - interval '9 days' + interval '11 hours', true, null)
on conflict (id) do nothing;

-- ── invoices, for the home screen's attention rows ─────────────────
-- One overdue and one stale draft, because "Needs attention" renders only
-- when it has rows: with an empty database the card is invisible and cannot
-- be reviewed at all.
insert into invoices (
  id, user_id, client_id, invoice_number, sequence_no, status,
  issue_date, due_date, period_start, period_end,
  subtotal, tax_rate, tax_amount, total, currency, grouping_mode
)
values
  -- Sent, past due. US framing: Net 30 terms, no tax line.
  ('00000000-0000-4000-8000-0000000000f1',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000c1',
   'STINT-0001', 1, 'sent',
   current_date - 40, current_date - 12, current_date - 60, current_date - 31,
   900, 0, 0, 900, 'USD', 'task'),
  -- A draft old enough to have been forgotten.
  ('00000000-0000-4000-8000-0000000000f2',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000c2',
   'STINT-0002', 2, 'draft',
   current_date - 15, null, current_date - 45, current_date - 16,
   400, 0, 0, 400, 'USD', 'task')
on conflict (id) do nothing;

-- Numbering must not collide with the seeded invoices.
update user_settings
   set next_invoice_number = 3
 where user_id = '00000000-0000-4000-8000-000000000001';

-- An entry with no project: it cannot resolve a rate beyond the user default
-- and is the "unprojected" attention row.
insert into time_entries (id, user_id, project_id, task_name, started_at, ended_at, is_billable)
values
  ('00000000-0000-7000-8000-0000000000e8',
   '00000000-0000-4000-8000-000000000001', null,
   'Forgot to pick a project',
   date_trunc('day', now()) - interval '3 days' + interval '14 hours',
   date_trunc('day', now()) - interval '3 days' + interval '15 hours 30 minutes',
   true)
on conflict (id) do nothing;
