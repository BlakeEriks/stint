-- Unbilled work per client, with the resolved rate applied in SQL.
--
-- Set-returning rather than per-entry: the Unbilled card sums across hundreds
-- of entries and must not call `resolve_entry_rate` N times.
--
-- `0` is a valid rate, so this coalesces rather than testing truthiness. An
-- entry resolving to NULL is counted separately, so the card can say the
-- total is incomplete rather than quietly understating it.
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
      coalesce(
        e.rate_override,
        p.hourly_rate,
        c.hourly_rate,
        s.default_hourly_rate
      ) as rate
    from time_entries e
    left join projects      p on p.id = e.project_id
    left join clients       c on c.id = p.client_id
    left join user_settings s on s.user_id = e.user_id
    where e.user_id      = p_user_id
      and e.invoice_id   is null      -- not yet billed
      and e.ended_at     is not null  -- a running timer is not billable yet
      and e.is_billable
  ),
  -- Group by (client, RATE) first: one client can have entries at several
  -- rates, and collapsing them to a single rate misstates what is owed.
  -- Rounding is once per bucket, from summed seconds — see `invoice.ts`.
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
    -- NULL-rated seconds contribute no amount, and `unrated_count` is what
    -- tells the card the total is incomplete rather than simply low.
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

revoke all on function unbilled_by_client(uuid) from public, anon;
grant execute on function unbilled_by_client(uuid) to authenticated;
