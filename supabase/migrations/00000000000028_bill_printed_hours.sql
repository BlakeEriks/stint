-- Every rollup prices the hours the invoice prints.
--
-- A time line prints `quantity x unit_price`, where the quantity is hours to
-- two decimals. Until now the amount came from the raw seconds, so the
-- document said 7.50 h x $100.00 and charged $749.89 (#195); the rollups
-- priced raw seconds too, and a half cent that Postgres's `numeric` rounds
-- up JavaScript's float rounded down, so the home screen and the invoice
-- named different cents for one entry (#191); and because each side rounded
-- once per ITS bucket, the invoice's total moved with its grouping (#192).
--
-- One rule now, in `buildLineItems` and here: each entry's hours are rounded
-- to two decimals, a bucket's quantity is the sum of those, and its amount is
-- `round(quantity * rate, 2)`. The invoice bills exactly what it prints, the
-- total is the same however its lines are grouped, and every rollup states
-- the same figure — to the cent when the rate is whole dollars. A rate with
-- cents can still put a grouped line a cent from its bucket, because one
-- rounding over 0.66 h is not two over 0.33 h; `rates.test.ts` bounds it.
--
-- The cost is the industry's: three 20-minute entries are 0.33 h each and
-- bill 0.99 h. Harvest does the same, and a client checking the arithmetic
-- on the page finds it right, which is what the document is for.
--
-- Same signatures, so `create or replace` keeps every grant; they are
-- restated to keep the convention visible.

create or replace function unbilled_by_client(p_user_id uuid)
returns table (
  client_id     uuid,
  client_name   text,
  currency      char(3),
  seconds       bigint,
  amount        numeric,
  unrated_count bigint,
  oldest_at     timestamptz
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with resolved as (
    select
      p.client_id,
      e.duration_seconds,
      round(e.duration_seconds / 3600.0, 2) as hours,
      e.started_at,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    where e.user_id      = p_user_id
      and e.invoice_id   is null      -- not yet billed
      and e.ended_at     is not null  -- a running timer is not billable yet
      and e.is_billable
      and not e.invoiced_elsewhere
  ),
  per_rate as (
    select
      r.client_id,
      r.rate,
      sum(r.duration_seconds)                                   as seconds,
      round(sum(r.hours) * r.rate, 2)                           as amount,
      count(*) filter (where r.rate is null)                    as unrated,
      min(r.started_at)                                         as oldest_at
    from resolved r
    group by r.client_id, r.rate
  )
  select
    b.client_id,
    cl.name,
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    coalesce(sum(b.amount), 0),
    sum(b.unrated)::bigint,
    min(b.oldest_at)
  from per_rate b
  left join clients       cl on cl.id = b.client_id
  left join user_settings st on st.user_id = p_user_id
  group by b.client_id, cl.name, cl.currency, st.currency
  having sum(b.seconds) > 0
  order by 5 desc nulls last
$$;

create or replace function month_revenue(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns numeric
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with resolved as (
    select
      round(e.duration_seconds / 3600.0, 2) as hours,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
      and e.ended_at   is not null   -- a running timer has not been earned yet
      and e.is_billable
      and e.started_at >= p_from
      and e.started_at <  p_to
      and (e.invoice_id is null or i.status <> 'void')
  ),
  per_rate as (
    select round(sum(hours) * rate, 2) as amount
    from resolved
    where rate is not null       -- unrated work earns nothing it can name
    group by rate
  )
  select coalesce(sum(amount), 0) from per_rate
$$;

create or replace function revenue_by_client(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (
  client_id     uuid,
  client_name   text,
  currency      char(3),
  seconds       bigint,
  invoiced      numeric,
  unbilled      numeric,
  unrated_count bigint
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with resolved as (
    select
      p.client_id,
      e.duration_seconds,
      round(e.duration_seconds / 3600.0, 2) as hours,
      e.invoice_id is not null as is_invoiced,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
      and e.ended_at   is not null   -- a running timer has not been earned yet
      and e.is_billable
      and e.started_at >= p_from
      and e.started_at <  p_to
      and (e.invoice_id is null or i.status <> 'void')
  ),
  per_rate as (
    select
      r.client_id,
      r.rate,
      r.is_invoiced,
      sum(r.duration_seconds)                             as seconds,
      round(sum(r.hours) * r.rate, 2)                     as amount,
      count(*) filter (where r.rate is null)              as unrated
    from resolved r
    group by r.client_id, r.rate, r.is_invoiced
  )
  select
    b.client_id,
    cl.name,
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    coalesce(sum(b.amount) filter (where b.is_invoiced), 0),
    coalesce(sum(b.amount) filter (where not b.is_invoiced), 0),
    sum(b.unrated)::bigint
  from per_rate b
  left join clients       cl on cl.id = b.client_id
  left join user_settings st on st.user_id = p_user_id
  group by b.client_id, cl.name, cl.currency, st.currency
  having sum(b.seconds) > 0
  order by coalesce(sum(b.amount), 0) desc nulls last
$$;

create or replace function revenue_by_day(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text
)
returns table (
  day     date,
  seconds bigint,
  amount  numeric
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with resolved as (
    select
      (e.started_at at time zone p_tz)::date as day,
      e.duration_seconds,
      round(e.duration_seconds / 3600.0, 2) as hours,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
      and e.ended_at   is not null   -- a running timer has not been earned yet
      and e.is_billable
      and e.started_at >= p_from
      and e.started_at <  p_to
      and (e.invoice_id is null or i.status <> 'void')
  ),
  per_rate as (
    select
      r.day,
      sum(r.duration_seconds) as seconds,
      -- A null rate yields a null amount, which `sum` then skips — so the
      -- seconds survive and the money does not invent a figure for them.
      case when r.rate is null then null
           else round(sum(r.hours) * r.rate, 2) end as amount
    from resolved r
    group by r.day, r.rate
  )
  select b.day, sum(b.seconds)::bigint, sum(b.amount)
  from per_rate b
  group by b.day
  order by b.day
$$;

create or replace function revenue_by_project(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (
  project_id       uuid,
  project_name     text,
  client_id        uuid,
  client_name      text,
  currency         char(3),
  seconds          bigint,
  billable_seconds bigint,
  invoiced         numeric,
  unbilled         numeric,
  unrated_count    bigint
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with resolved as (
    select
      e.project_id,
      p.client_id,
      e.duration_seconds,
      round(e.duration_seconds / 3600.0, 2) as hours,
      e.is_billable,
      e.invoice_id is not null as is_invoiced,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
      and e.ended_at   is not null   -- a running timer has not been earned yet
      and e.started_at >= p_from
      and e.started_at <  p_to
      and (e.invoice_id is null or i.status <> 'void')
  ),
  -- `is_billable` is not a WHERE clause here: the hours reading counts all
  -- worked time, so unbillable work survives to the aggregate and is kept
  -- out of the money there instead.
  per_rate as (
    select
      r.project_id,
      r.client_id,
      r.rate,
      r.is_invoiced,
      sum(r.duration_seconds)                                              as seconds,
      sum(r.duration_seconds) filter (where r.is_billable)                 as billable_seconds,
      round(coalesce(sum(r.hours) filter (where r.is_billable), 0)
              * r.rate, 2)                                                 as amount,
      count(*) filter (where r.rate is null and r.is_billable)             as unrated
    from resolved r
    group by r.project_id, r.client_id, r.rate, r.is_invoiced
  )
  select
    b.project_id,
    pr.name,
    b.client_id,
    cl.name,
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    coalesce(sum(b.billable_seconds), 0)::bigint,
    coalesce(sum(b.amount) filter (where b.is_invoiced), 0),
    coalesce(sum(b.amount) filter (where not b.is_invoiced), 0),
    sum(b.unrated)::bigint
  from per_rate b
  left join projects      pr on pr.id = b.project_id
  left join clients       cl on cl.id = b.client_id
  left join user_settings st on st.user_id = p_user_id
  group by b.project_id, pr.name, b.client_id, cl.name, cl.currency, st.currency
  having sum(b.seconds) > 0
  order by sum(b.seconds) desc, pr.name asc
$$;

revoke all on function unbilled_by_client(uuid) from public, anon;
grant execute on function unbilled_by_client(uuid) to authenticated;
revoke all on function month_revenue(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function month_revenue(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function revenue_by_client(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function revenue_by_client(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function revenue_by_day(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function revenue_by_day(uuid, timestamptz, timestamptz, text) to authenticated;
revoke all on function revenue_by_project(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function revenue_by_project(uuid, timestamptz, timestamptz) to authenticated;
