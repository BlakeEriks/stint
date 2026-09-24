-- The monthly goal goes, columns and all.
--
-- A goal is a number the user invents, and a pace line, a percentage or a
-- projected shortfall is arithmetic on a guess wearing the authority of a
-- fact. It failed the gate in `docs/design/principles.md` twice over: not a
-- number the user cannot compute in their head, and a figure that moves must
-- be true.
--
-- Home's projection survives it and reads no target. It extrapolates EARNED,
-- which accumulates and so can be extrapolated; unbilled resets when an
-- invoice goes out, so projecting it would forecast the next invoice date and
-- predict a drop to zero (`docs/design/screens/home.html`).
--
-- The constraint goes first: dropping a column drops any check that names it
-- alone, but `monthly_target_needs_unit` names both and would outlive the
-- first drop.
alter table user_settings
  drop constraint if exists monthly_target_needs_unit;

alter table user_settings
  drop column if exists monthly_target,
  drop column if exists monthly_target_unit;
