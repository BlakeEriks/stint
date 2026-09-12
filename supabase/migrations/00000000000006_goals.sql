-- A monthly target, so the Pace card has something to measure against.
--
-- Monthly only, and one unit at a time. A contractor thinks in months because
-- invoicing is monthly; week and quarter targets would be three progress bars
-- competing for the same glance. Two units at once is the same problem.
--
-- Both nullable: no target is the default, and `docs/design/home.md` specifies
-- the Pace card hides entirely when none is set rather than rendering an empty
-- bar that asks to be configured.
alter table user_settings
  add column monthly_target        numeric(12,2)
    check (monthly_target is null or monthly_target > 0),
  -- 'hours' counts tracked time; 'revenue' counts money.
  --
  -- Revenue means work DONE — invoiced plus unbilled at its resolved rate —
  -- never money collected. A bar reading 40% because a client has not paid yet
  -- is noise about someone else's behaviour, and the same honesty rule as the
  -- Unbilled card applies: this is not "earned".
  add column monthly_target_unit   text
    check (monthly_target_unit in ('hours', 'revenue'));

-- A unit without a target is meaningless, and a target without a unit cannot
-- be rendered. Enforced here rather than in the API because both writers
-- (settings PATCH today, an onboarding flow later) would otherwise need to
-- remember it.
alter table user_settings
  add constraint monthly_target_needs_unit
    check ((monthly_target is null) = (monthly_target_unit is null));
