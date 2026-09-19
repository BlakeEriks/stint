-- `collected_by_month` reports each month once per currency.
--
-- An invoice carries its own `currency`, so a month in which a €1,000 and a
-- $500 invoice were both paid has two facts in it and one `sum` turns them
-- into 1500 of nothing. Money is not addable across currencies, and Home
-- leads with this figure — the one number on the screen that is finished.
--
-- Grouping is the fix rather than a filter, on the same terms as
-- `revenue_by_client` and `revenue_by_project`, which both carry a currency
-- out and leave the caller to decide: SQL's job is that the window is
-- complete, and picking which currency the screen shows is the caller's.
--
-- The return type gains a column, so the function is dropped and recreated;
-- `create or replace` cannot widen one.
drop function if exists collected_by_month(uuid, timestamptz, timestamptz, text);

create function collected_by_month(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text
)
returns table (
  month     text,
  currency  char(3),
  amount    numeric
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  select
    to_char((i.paid_at at time zone p_tz)::date, 'YYYY-MM') as month,
    i.currency,
    sum(i.total) as amount
  from invoices i
  where i.user_id = p_user_id
    and i.status  = 'paid'
    and i.paid_at >= p_from
    and i.paid_at <  p_to
  group by 1, 2
  order by 1, 2
$$;

revoke all on function collected_by_month(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function collected_by_month(uuid, timestamptz, timestamptz, text) to authenticated;
