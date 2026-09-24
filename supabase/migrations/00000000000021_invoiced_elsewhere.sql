-- Work already invoiced from another tool — typically history brought in by
-- an import. It still counts as earned, because it was; it is never unbilled
-- and never lands on an invoice here, because it has already been billed.
--
-- A flag rather than an invoice: a placeholder invoice would take a real
-- number and list a document that was never sent.
alter table time_entries
  add column invoiced_elsewhere boolean not null default false;

drop index if exists entries_unbilled_idx;
create index entries_unbilled_idx on time_entries (user_id, project_id)
  where invoice_id is null and is_billable and not invoiced_elsewhere;

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
      and not e.invoiced_elsewhere
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
