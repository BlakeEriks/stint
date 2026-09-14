-- Revenue for a month, so a money target can report a real figure.
--
-- Revenue here is WORK DONE, not money collected: a client paying late says
-- nothing about the month you worked, and a bar that drops when an invoice is
-- still outstanding would report someone else's behaviour as your own. That is
-- also what `packages/schema` already documents the unit to mean.
--
-- Bucketing is by the ENTRY's own date, never the invoice's `issue_date`.
-- `period_start`/`period_end` are independent of `issue_date`, so invoicing
-- March's work on April 1st is ordinary — booking that revenue into April
-- would make the figure report when paperwork happened.
--
-- Voided invoices are excluded and their entries are released back to
-- unbilled, so voiding never inflates or strands a month.
--
-- The rate is resolved per entry, not read off `invoice_line_items`: a line
-- groups several entries and carries no entry reference, so its rounded
-- amount cannot be split back across them. An issued invoice's own total
-- remains authoritative for what is owed; this is a month indicator.
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
  -- Grouped by rate before multiplying: work at 150 and work at 195 are
  -- different money, and summing the seconds first would apply one rate to
  -- both. Rounded once per bucket, from summed seconds, because rounding per
  -- entry and then adding drifts.
  per_rate as (
    select round(sum(duration_seconds) / 3600.0 * rate, 2) as amount
    from resolved
    where rate is not null       -- unrated work earns nothing it can name
    group by rate
  )
  select coalesce(sum(amount), 0) from per_rate
$$;

revoke all on function month_revenue(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function month_revenue(uuid, timestamptz, timestamptz) to authenticated;
