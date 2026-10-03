-- A running timer counts, up to now, in every figure the home screen and the
-- menu bar show (specs/004-live-earned).
--
-- Until now these rollups skipped a running entry, while the screen counted
-- its time from `started_at`: Today read `$0.00` beside `22m`, then jumped at
-- the stop. Now the session so far is measured here, at `p_now`, and priced by
-- the same printed-hours rule as a stopped entry. `duration_seconds` is
-- generated as `extract(epoch from ended_at - started_at)::integer`, so a
-- timer stopped at the moment of a read prices to the same cent: stopping
-- moves no figure.
--
-- Display only. Invoicing selects its own entries in
-- `apps/web/src/lib/invoicing.ts`, with its own `ended_at is not null`, so a
-- running entry still never reaches an invoice.
--
-- `p_now` is the caller's instant, defaulting to `now()`. The route already
-- picks one instant for its day, week and month windows; measuring the
-- running entry at the same one keeps a figure from straddling two clocks,
-- the way `/summary` measures it. A new trailing parameter is a new
-- signature, so the old functions are dropped first: left beside them, a
-- call without `p_now` would be ambiguous.

drop function unbilled_by_client(uuid);
drop function revenue_by_client(uuid, timestamptz, timestamptz);
drop function revenue_by_day(uuid, timestamptz, timestamptz, text);

-- A stopped entry's length, or a running one's so far at `p_now`.
create function entry_seconds(
  p_started_at       timestamptz,
  p_duration_seconds integer,
  p_now              timestamptz
)
returns integer
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    p_duration_seconds,
    greatest(0, extract(epoch from (p_now - p_started_at)))::integer
  )
$$;

create function unbilled_by_client(
  p_user_id uuid,
  p_now     timestamptz default now()
)
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
      entry_seconds(e.started_at, e.duration_seconds, p_now) as duration_seconds,
      round(entry_seconds(e.started_at, e.duration_seconds, p_now) / 3600.0, 2) as hours,
      e.started_at,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    where e.user_id      = p_user_id
      and e.invoice_id   is null      -- not yet billed
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

create function revenue_by_client(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_now     timestamptz default now()
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
      entry_seconds(e.started_at, e.duration_seconds, p_now) as duration_seconds,
      round(entry_seconds(e.started_at, e.duration_seconds, p_now) / 3600.0, 2) as hours,
      e.invoice_id is not null as is_invoiced,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
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

create function revenue_by_day(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text,
  p_now     timestamptz default now()
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
      entry_seconds(e.started_at, e.duration_seconds, p_now) as duration_seconds,
      round(entry_seconds(e.started_at, e.duration_seconds, p_now) / 3600.0, 2) as hours,
      resolve_rate(e.rate_override, p.hourly_rate, c.hourly_rate, s.default_hourly_rate) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    left join invoices      i on i.id = e.invoice_id
    where e.user_id    = p_user_id
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

revoke all on function entry_seconds(timestamptz, integer, timestamptz) from public, anon;
grant execute on function entry_seconds(timestamptz, integer, timestamptz) to authenticated;
revoke all on function unbilled_by_client(uuid, timestamptz) from public, anon;
grant execute on function unbilled_by_client(uuid, timestamptz) to authenticated;
revoke all on function revenue_by_client(uuid, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function revenue_by_client(uuid, timestamptz, timestamptz, timestamptz) to authenticated;
revoke all on function revenue_by_day(uuid, timestamptz, timestamptz, text, timestamptz) from public, anon;
grant execute on function revenue_by_day(uuid, timestamptz, timestamptz, text, timestamptz) to authenticated;
