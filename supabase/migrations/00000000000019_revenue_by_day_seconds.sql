-- `revenue_by_day` grows a `seconds` column, for the week's bars.
--
-- The bars plot HOURS as height and print MONEY at each bar's head
-- (`docs/design/screens/home.html`, "The week's bars"), so one row has to
-- carry both. A second query grouped on the same local date would be a second
-- definition of the same day.
--
-- `seconds` and `amount` deliberately do NOT share a filter:
--
--   * `seconds` counts ALL billable worked time in the day, INCLUDING work
--     whose rate chain resolves to null. That time was worked and the bar's
--     height is the honest record of it; dropping it would draw a short day
--     that was not short.
--   * `amount` keeps its existing meaning — unrated work earns nothing it can
--     name, so it is excluded from the money. A rate of exactly 0 is a real
--     rate: it counts in `seconds` AND contributes 0.00 to `amount`.
--
-- So a day of purely unrated work returns its seconds with `amount` null, and
-- the caller prints the bar without a figure.
--
-- Everything else is unchanged from `00000000000012_revenue_by_client.sql`:
-- the same coalesce chain, the same group-by-(day, RATE)-then-reaggregate so
-- rounding happens once per bucket, the same DST-correct local day key, and
-- the same exclusions for running timers and voided invoices.
--
-- `create or replace function` cannot add a column to an existing RETURNS
-- TABLE ("cannot change return type of existing function"), so the old
-- signature is dropped first — which drops its grants with it, hence the
-- revoke/grant pair below.
drop function if exists revenue_by_day(uuid, timestamptz, timestamptz, text);

create function revenue_by_day(
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
      -- Rounded per (day, rate) bucket; a null rate yields a null amount,
      -- which `sum` then skips — so the seconds survive and the money does
      -- not invent a figure for them.
      case when r.rate is null then null
           else round(sum(r.duration_seconds) / 3600.0 * r.rate, 2) end as amount
    from resolved r
    group by r.day, r.rate
  )
  select b.day, sum(b.seconds)::bigint, sum(b.amount)
  from per_rate b
  group by b.day
  order by b.day
$$;

revoke all on function revenue_by_day(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function revenue_by_day(uuid, timestamptz, timestamptz, text) to authenticated;
