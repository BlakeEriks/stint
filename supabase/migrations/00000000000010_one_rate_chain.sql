-- One rate chain in SQL, called by everything that resolves a rate.
--
-- It takes values rather than an entry id so the rollups can call it once per
-- row in a join. `immutable` + `language sql` lets Postgres inline it, and a
-- `set search_path` clause would block that — safe to omit here because the
-- function references no table for a caller to shadow.
create or replace function resolve_rate(
  p_rate_override numeric,
  p_project_rate  numeric,
  p_client_rate   numeric,
  p_default_rate  numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select coalesce(p_rate_override, p_project_rate, p_client_rate, p_default_rate)
$$;

-- The client is reached THROUGH the project, so an entry with no project
-- resolves past both levels to the user default.
create or replace function resolve_entry_rate(p_entry_id uuid)
returns numeric
language sql stable as $$
  select resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate)
  from time_entries e
  left join projects      p on p.id = e.project_id
  left join clients       c on c.id = p.client_id
  left join user_settings s on s.user_id = e.user_id
  where e.id = p_entry_id
$$;

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
  ),
  -- The rate is part of the grouping key for the same reason it is on an
  -- invoice line: one client can have work at several rates, and collapsing
  -- them to one misstates what is owed. Rounding is once per bucket, from
  -- summed seconds — see `invoice.ts`.
  per_rate as (
    select
      r.client_id,
      r.rate,
      sum(r.duration_seconds)                                   as seconds,
      round(sum(r.duration_seconds) / 3600.0 * r.rate, 2)       as amount,
      count(*) filter (where r.rate is null)                    as unrated,
      min(r.started_at)                                         as oldest_at
    from resolved r
    group by r.client_id, r.rate
  )
  select
    b.client_id,
    -- Internal work has no client; the caller labels the null row.
    cl.name,
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    -- NULL-rated seconds contribute no amount; `unrated_count` tells the card
    -- the total is incomplete rather than simply low.
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
      -- Unbilled work counts at its resolved rate; invoiced work counts
      -- unless the invoice was voided.
      and (e.invoice_id is null or i.status <> 'void')
  ),
  -- Grouped by rate before multiplying: summing the seconds first would apply
  -- one rate to work billed at several. Rounded once per bucket.
  per_rate as (
    select round(sum(duration_seconds) / 3600.0 * rate, 2) as amount
    from resolved
    where rate is not null       -- unrated work earns nothing it can name
    group by rate
  )
  select coalesce(sum(amount), 0) from per_rate
$$;

revoke all on function resolve_rate(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function resolve_rate(numeric, numeric, numeric, numeric) to authenticated;

revoke all on function unbilled_by_client(uuid) from public, anon;
grant execute on function unbilled_by_client(uuid) to authenticated;

revoke all on function month_revenue(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function month_revenue(uuid, timestamptz, timestamptz) to authenticated;
