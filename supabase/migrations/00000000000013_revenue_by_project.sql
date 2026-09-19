-- Trailing-window revenue per project, split invoiced vs not yet invoiced.
--
-- The by-project sibling of `revenue_by_client`: same coalesce chain, same
-- group-by-RATE-then-reaggregate shape, same once-per-bucket rounding. A
-- divergence would put two figures on the home screen that disagree.
--
-- Grouped on `p.id`, never `p.name` — `projects.name` has no unique
-- constraint, so two projects called "Redesign" under different clients are
-- distinct rows and must stay distinct. The client rides along so the caller
-- can tell them apart.
--
-- Entries with no project are kept, collapsing to one null-`project_id` row
-- exactly as the null-client row does above. The caller keeps that row out of
-- its columns; SQL's job is that the window's total is complete.
--
-- Bucketed by the ENTRY's `started_at`, never an invoice's `issue_date`.
-- Voided invoices are excluded outright.
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
  -- Unlike `revenue_by_client`, `is_billable` is not a WHERE clause here: the
  -- hours reading counts all worked time, so unbillable work must survive to
  -- the aggregate and be filtered out of the money there instead.
  --
  -- `is_invoiced` joins the rate in the grouping key so the split is summed
  -- from buckets that were each rounded once, rather than rounding the split
  -- after the fact.
  per_rate as (
    select
      r.project_id,
      r.client_id,
      r.rate,
      r.is_invoiced,
      sum(r.duration_seconds)                                              as seconds,
      sum(r.duration_seconds) filter (where r.is_billable)                 as billable_seconds,
      round(sum(r.duration_seconds) filter (where r.is_billable)
              / 3600.0 * r.rate, 2)                                        as amount,
      count(*) filter (where r.rate is null and r.is_billable)             as unrated
    from resolved r
    group by r.project_id, r.client_id, r.rate, r.is_invoiced
  )
  select
    b.project_id,
    -- Unfiled work has no project and internal work has no client; the caller
    -- labels both null rows.
    pr.name,
    b.client_id,
    cl.name,
    -- `projects` has no currency, so a project with no client falls through to
    -- the user's own setting.
    coalesce(cl.currency, st.currency),
    sum(b.seconds)::bigint,
    coalesce(sum(b.billable_seconds), 0)::bigint,
    -- A rate of exactly 0 is a real rate and contributes 0.00; only a NULL
    -- rate contributes nothing AND raises `unrated_count`, which is what tells
    -- the card the figure is incomplete rather than simply low.
    coalesce(sum(b.amount) filter (where b.is_invoiced), 0),
    coalesce(sum(b.amount) filter (where not b.is_invoiced), 0),
    sum(b.unrated)::bigint
  from per_rate b
  left join projects      pr on pr.id = b.project_id
  left join clients       cl on cl.id = b.client_id
  left join user_settings st on st.user_id = p_user_id
  group by b.project_id, pr.name, b.client_id, cl.name, cl.currency, st.currency
  having sum(b.seconds) > 0
  -- Ties at 0.00 revenue are common, so the name is a stable secondary key.
  order by sum(b.seconds) desc, pr.name asc
$$;

revoke all on function revenue_by_project(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function revenue_by_project(uuid, timestamptz, timestamptz) to authenticated;
