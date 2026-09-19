-- Money that arrived, bucketed by when it arrived.
--
-- The counterpart to `month_revenue`, and deliberately the other unit. That
-- one reports WORK DONE so a target is not hostage to a client's payment
-- habits; this one reports MONEY COLLECTED, the only figure on Home that is
-- finished — the work is done, the invoice is settled, and nothing downstream
-- revises it. The two never reconcile and are never summed.
--
-- The invoice's own `total` is authoritative here, never a per-entry rate
-- resolution. `month_revenue` resolves rates because it is a month indicator
-- over work that may not be invoiced at all; a payment is a fact about an
-- issued document, and `total` is the number the client actually paid.

-- ── a paid invoice has a payment date ──────────────────────────────
--
-- The column stays nullable, because a draft legitimately has none: the
-- invariant is the PAIR. Nothing produces the bad state today — the status
-- route is the only writer of `status = 'paid'` and sets `paid_at` in the
-- same statement — but `collected` is the first thing to READ the column.
-- While it was write-only a null cost nothing; once Home's leading figure is
-- derived from it, a null drops a real payment out of the number that says
-- what arrived, which is the silent misreporting the app exists not to do.
--
-- `void` is exempt: an invoice can be voided from any state, and a voided
-- draft that was never paid must not be blocked by a constraint about
-- payment.
alter table invoices
  add constraint paid_has_paid_at
  check (status <> 'paid' or paid_at is not null);

-- `sent_at` gets no matching constraint. The transition table only reaches
-- `paid` through `sent`, so it looks like the same invariant — but rows
-- written directly, by a seed or a fixture, arrive at `paid` without ever
-- passing through the route that sets it. `paid_at` survives that because
-- whoever writes a paid invoice supplies the payment date; the send date is
-- the one nobody thinks to invent. Nothing reads `sent_at` yet, so the
-- constraint would buy nothing and break seeding.

-- Payments are read by date, so the index that serves `collected` is on the
-- date and not on the status the existing index already covers.
create index invoices_user_paid_at_idx
  on invoices (user_id, paid_at)
  where status = 'paid';

-- ── the rollup ─────────────────────────────────────────────────────
--
-- Bucketed in the CALLER's zone, like `revenue_by_day`: a payment cleared at
-- 6pm on the 31st belongs to that month for the person who recorded it, and
-- bucketing in UTC pushes it into the next one for anyone west of Greenwich.
--
-- Months with no payments are absent from the result, not zero. The caller
-- builds the fixed six-month window and fills the gaps, because only it knows
-- how many months the plot draws — and a quiet month must render as a real
-- zero rather than a hole in the line.
--
-- Voided invoices cannot appear: `void` is terminal and a voided invoice is
-- not `paid`, so the status filter excludes them without a second clause.
create or replace function collected_by_month(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text
)
returns table (
  month   text,
  amount  numeric
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  select
    to_char((i.paid_at at time zone p_tz)::date, 'YYYY-MM') as month,
    sum(i.total) as amount
  from invoices i
  where i.user_id = p_user_id
    and i.status  = 'paid'
    and i.paid_at >= p_from
    and i.paid_at <  p_to
  group by 1
  order by 1
$$;

revoke all on function collected_by_month(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function collected_by_month(uuid, timestamptz, timestamptz, text) to authenticated;
