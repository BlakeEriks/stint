-- Unbilled work per client, with the resolved rate applied in SQL.
--
-- `resolve_entry_rate(uuid)` is per-entry and correct, but the Unbilled card
-- sums across potentially hundreds of entries and must not call it N times.
-- This is the set-returning shape `docs/design/home.md` calls for.
--
-- The coalesce chain is IDENTICAL to resolve_entry_rate's — entry override,
-- then project, then client, then the user default. If one changes the other
-- must, or the home screen and an invoice preview will report different money
-- for the same work, and `data-model.md` makes the SQL authoritative.
--
-- `0` is a valid rate, so this coalesces rather than testing truthiness; an
-- entry that resolves to NULL has no rate at all and is counted separately so
-- the card can say the total is incomplete rather than quietly understating
-- it.
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
  -- Group by (client, RATE) first. The rate is part of the grouping key for
  -- the same reason it is on an invoice line: one client can have entries at
  -- several rates — a project override, or two projects priced differently —
  -- and collapsing them to a single rate misstates what is owed. Verified
  -- against the seed, where Northwind has work at both 150 and 195: taking
  -- one rate for the client reported $1755.00 instead of $1462.50.
  --
  -- Rounding happens once per (client, rate) bucket, from summed seconds.
  -- Rounding per entry and then adding drifts — 3 x 20min at 100/h gives
  -- 99.99 rather than 100.00.
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
