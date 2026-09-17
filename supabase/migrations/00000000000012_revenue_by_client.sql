-- Trailing-window revenue per client, split invoiced vs not yet invoiced.
--
-- Set-returning and grouped in SQL for the same reason as `unbilled_by_client`:
-- a trailing quarter spans thousands of entries and must not call
-- `resolve_entry_rate` once per row.
--
-- Same coalesce chain, same group-by-(client, RATE)-then-reaggregate shape and
-- the same once-per-bucket rounding as `unbilled_by_client` and
-- `month_revenue`. A divergence here would put a figure on the home screen
-- that disagrees with Unbilled directly above it.
--
-- Bucketed by the ENTRY's `started_at`, never an invoice's `issue_date` — see
-- `month_revenue`. Voided invoices are excluded outright, which is what both
-- neighbours do: `unbilled_by_client` requires `invoice_id is null`, so a
-- voided invoice's entry is not unbilled there either.
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
  -- `is_invoiced` joins the rate in the grouping key so the split is summed
  -- from buckets that were each rounded once, rather than rounding the split
  -- after the fact.
  per_rate as (
    select
      r.client_id,
      r.rate,
      r.is_invoiced,
      sum(r.duration_seconds)                             as seconds,
      round(sum(r.duration_seconds) / 3600.0 * r.rate, 2) as amount,
      count(*) filter (where r.rate is null)              as unrated
    from resolved r
    group by r.client_id, r.rate, r.is_invoiced
  )
  select
    b.client_id,
    -- Internal work has no client; the caller labels the null row.
    cl.name,
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    -- A rate of exactly 0 is a real rate and contributes 0.00; only a NULL
    -- rate contributes nothing AND raises `unrated_count`, which is what tells
    -- the card the figure is incomplete rather than simply low.
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

revoke all on function revenue_by_client(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function revenue_by_client(uuid, timestamptz, timestamptz) to authenticated;

-- Revenue per local calendar day, so the month line can be drawn cumulatively.
--
-- `month_revenue` answers the month as one number and cannot be summed into a
-- series. The day key is resolved in `p_tz` rather than UTC for the reason
-- `calendar.ts` gives: treating the boundary as UTC moves an evening's work
-- into the next day for anyone west of Greenwich.
--
-- Grouped by (day, RATE) so the same once-per-bucket rounding applies within
-- each day; summing the days then reproduces `month_revenue` for the window.
create or replace function revenue_by_day(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text
)
returns table (
  day     date,
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
      round(sum(r.duration_seconds) / 3600.0 * r.rate, 2) as amount
    from resolved r
    where r.rate is not null       -- unrated work earns nothing it can name
    group by r.day, r.rate
  )
  select b.day, sum(b.amount)
  from per_rate b
  group by b.day
  order by b.day
$$;

revoke all on function revenue_by_day(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function revenue_by_day(uuid, timestamptz, timestamptz, text) to authenticated;
