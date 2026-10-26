-- #432: how often a client's contract bills it. Null is no schedule, so every
-- existing client keeps today's behavior. Weekly and biweekly count from an
-- anchor date; the others are calendar periods and carry none.
alter table clients
  add column billing_period text
    check (billing_period in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  add column period_anchor date,
  add constraint billing_period_anchor check (
    coalesce(billing_period in ('weekly', 'biweekly'), false)
      = (period_anchor is not null)
  );
