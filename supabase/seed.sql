-- Seed data for local development. Runs on `pnpm dev:reset`.
--
-- Why this exists: an empty app is a poor test of a layout change. A nav
-- rail, a calendar week, an unbilled total and a status pill all look fine
-- with nothing in them — the bugs appear when there is real content of
-- varying length sitting in them.
--
-- Two halves. The hand-written rows below name the awkward cases a layout has
-- to survive, one row each, and are meant to be read. The generated year at
-- the foot is volume: the heatmap reads a year at a time and cannot be judged
-- from a handful of days. It is
-- generated because a year hand-written is a file nobody will correct, and
-- deterministically so a screenshot diff between two runs means something.
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
  invoice_number_prefix = 'STINT-'
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

-- ── a year of history, generated ───────────────────────────────────
-- The regions above this line need a handful of rows; the heatmap needs a
-- year of them, and a year hand-written is a file nobody will ever re-read
-- or correct.
--
-- Deterministic on purpose: the pick of client, start hour and length comes
-- from mixing the day's offset, never `random()`, so two `dev:reset` runs
-- produce byte-identical rows and a screenshot diff means something.
--
-- Offsets are relative to now() like everything else here, so the window stays
-- under the heatmap's trailing 364 days however long after writing it runs.
--
-- The shape it produces, and what each part is for:
--
--   * five-on-two-off for most of the year, so the heatmap shows a working
--     rhythm rather than a wash — weekends are blank, and blank is information
--   * two dry spells (a fortnight off around day 250, a week around day 120),
--     because a year with no gap in it never shows what a gap looks like
--   * a one-day gap 6 days back and a two-day gap at 19-20, so a recent
--     stretch carries gaps of both lengths rather than reading as one
--     unbroken run
--   * a different client mix in each of the last three months, so the month's
--     client strip has something to divide
with days as (
  select
    d                                             as offset_days,
    date_trunc('day', now()) - (d || ' days')::interval as day_start,
    -- Three coprime multipliers so the three picks below do not move together.
    (d * 7  + 3) % 11 as pick_client,
    (d * 13 + 5) % 7  as pick_hour,
    (d * 17 + 2) % 9  as pick_len
  -- From 4, not from 0: offsets 0-3 are the hand-written week above, and a
  -- generated row on those days would bury the overlap and the long/blank
  -- task names that week exists to demonstrate.
  from generate_series(4, 430) as d
),
worked as (
  select * from days
  -- The recent stretch is worked through its weekends — a contractor pushing
  -- to a deadline — so the heatmap carries a dense run as well as the steady
  -- five-on-two-off behind it. The two gaps below are weekdays.
  where (offset_days <= 40 or extract(isodow from day_start) < 6)
    and offset_days not between 244 and 258       -- a fortnight away
    and offset_days not between 118 and 124       -- a week off
    and offset_days <> 6                          -- a one-day gap
    and offset_days not between 19 and 20         -- a two-day gap
)
insert into time_entries (
  id, user_id, project_id, task_name, started_at, ended_at, is_billable
)
select
  -- UUIDv7-shaped and derived from the offset, so a re-run overwrites rather
  -- than duplicating, and `on conflict do nothing` stays meaningful.
  ('00000000-0000-7000-8000-1' || lpad(offset_days::text, 11, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  case
    -- The mix shifts by month: Northwind carried the oldest work, Byrne the
    -- middle, and the current quarter is split three ways.
    when offset_days > 120 then
      case when pick_client < 7 then '00000000-0000-4000-8000-00000000a001'
           when pick_client < 9 then '00000000-0000-4000-8000-00000000a002'
           else                      '00000000-0000-4000-8000-00000000a004' end
    when offset_days > 60 then
      case when pick_client < 6 then '00000000-0000-4000-8000-00000000a003'
           when pick_client < 9 then '00000000-0000-4000-8000-00000000a001'
           else                      '00000000-0000-4000-8000-00000000a004' end
    else
      case when pick_client < 4 then '00000000-0000-4000-8000-00000000a001'
           when pick_client < 7 then '00000000-0000-4000-8000-00000000a003'
           when pick_client < 9 then '00000000-0000-4000-8000-00000000a002'
           else                      '00000000-0000-4000-8000-00000000a004' end
  end::uuid,
  (array[
    'Ticket triage', 'Integration fixes', 'Client call and follow-up',
    'Schema migration', 'Design review', 'Reporting queries',
    'Performance pass'
  ])[pick_hour + 1],
  day_start + ((8 + pick_hour) || ' hours')::interval,
  day_start + ((8 + pick_hour) || ' hours')::interval
            + ((90 + pick_len * 45) || ' minutes')::interval,
  -- Internal work is the one unbillable project; everything else bills.
  pick_client < 9
from worked
on conflict (id) do nothing;

-- ── invoices over the history ──────────────────────────────────────
-- Without these every hour ever logged is unbilled, and the month's Unbilled
-- figure swallows the whole year — the case where the screen says least
-- about itself.
--
-- Older work is invoiced and the recent quarter is not, which is what a
-- contractor's ledger actually looks like mid-month.
insert into invoices (
  id, user_id, client_id, invoice_number, sequence_no, status,
  issue_date, due_date, period_start, period_end,
  subtotal, tax_rate, tax_amount, total, currency, grouping_mode,
  sent_at, paid_at
)
select
  ('00000000-0000-4000-8000-2' || lpad(n::text, 11, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000c1',
  'STINT-' || lpad((100 + n)::text, 4, '0'), 100 + n,
  -- The newest of these is still out; the rest were paid.
  case when n = 1 then 'sent' else 'paid' end,
  (date_trunc('day', now()) - ((n * 30 + 2) || ' days')::interval)::date,
  (date_trunc('day', now()) - ((n * 30 - 28) || ' days')::interval)::date,
  (date_trunc('day', now()) - ((n * 30 + 32) || ' days')::interval)::date,
  (date_trunc('day', now()) - ((n * 30 + 3)  || ' days')::interval)::date,
  0, 0, 0, 0, 'USD', 'task',
  now() - ((n * 30 + 2) || ' days')::interval,
  case when n = 1 then null else now() - ((n * 30 - 20) || ' days')::interval end
from generate_series(1, 9) as n
on conflict (id) do nothing;

-- Attaching entries is what makes them invoiced; the totals are then summed
-- back off the attached rows so the frozen figure and the line items agree.
-- Scoped to the invoice's OWN client. Every invoice above is raised against
-- c1, so without this the date window sweeps up whatever else ran that month
-- and three invoices bill one client for another's work — which makes the
-- month's client strip report money to the wrong name.
update time_entries e
   set invoice_id = ('00000000-0000-4000-8000-2' || lpad(n::text, 11, '0'))::uuid
  from generate_series(1, 9) as n
 where e.user_id = '00000000-0000-4000-8000-000000000001'
   and e.invoice_id is null
   and e.is_billable
   and e.ended_at is not null
   and e.project_id in (
     select p.id from projects p
      where p.client_id = '00000000-0000-4000-8000-0000000000c1'
   )
   and e.started_at >= date_trunc('day', now()) - ((n * 30 + 32) || ' days')::interval
   and e.started_at <  date_trunc('day', now()) - ((n * 30 + 2)  || ' days')::interval;

-- One line per (task, resolved rate), which is `grouping_mode = 'task'` and the
-- same key `buildLineItems` groups on — the rate belongs in the key because two
-- rates for one task name are two lines, not an average.
insert into invoice_line_items (
  invoice_id, description, unit, quantity, unit_price, amount, sort_order
)
select
  e.invoice_id,
  coalesce(nullif(e.task_name, ''), 'Untitled'),
  -- Seeded lines are all time. A `fixed` line is a charge the user typed,
  -- which no seed can invent on their behalf.
  'hour',
  round(sum(e.duration_seconds) / 3600.0, 2),
  resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate),
  round(sum(e.duration_seconds) / 3600.0
        * resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate), 2),
  row_number() over (partition by e.invoice_id order by coalesce(nullif(e.task_name, ''), 'Untitled'))
from time_entries e
left join projects      p on p.id = e.project_id
left join clients       c on c.id = p.client_id
left join user_settings s on s.user_id = e.user_id
join invoices i on i.id = e.invoice_id
where i.sequence_no >= 101
group by e.invoice_id, coalesce(nullif(e.task_name, ''), 'Untitled'),
         e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate;

-- Scoped to this user on BOTH sides. The subquery summed every account's
-- line items, and `sequence_no >= 101` is a per-user sequence — so on a
-- database holding a second account the seed rewrote that account's invoice
-- totals. A seed touches only what it seeded.
update invoices i
   set subtotal = t.total, total = t.total
  from (select li.invoice_id, sum(li.amount) as total
          from invoice_line_items li
          join invoices i2 on i2.id = li.invoice_id
         where i2.user_id = '00000000-0000-4000-8000-000000000001'
         group by li.invoice_id) as t
 where t.invoice_id = i.id
   and i.user_id = '00000000-0000-4000-8000-000000000001'
   and i.sequence_no >= 101;
