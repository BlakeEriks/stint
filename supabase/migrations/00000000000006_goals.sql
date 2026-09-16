-- A monthly target, so the Pace card has something to measure against.
--
-- Monthly only, and one unit at a time: a contractor thinks in months because
-- invoicing is monthly, and competing progress bars fight for one glance.
--
-- Both nullable — no target is the default, and the Pace card then hides
-- (`docs/design/screens/home.html`).
alter table user_settings
  add column monthly_target        numeric(12,2)
    check (monthly_target is null or monthly_target > 0),
  -- 'hours' counts tracked time; 'revenue' counts money. Revenue means work
  -- DONE, never money collected — `month_revenue` carries why.
  add column monthly_target_unit   text
    check (monthly_target_unit in ('hours', 'revenue'));

-- Enforced here rather than in the API, so every writer inherits it.
alter table user_settings
  add constraint monthly_target_needs_unit
    check ((monthly_target is null) = (monthly_target_unit is null));
