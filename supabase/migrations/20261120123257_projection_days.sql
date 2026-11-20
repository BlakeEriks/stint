-- Which days Home's month projection counts. Weekdays is the rule every
-- account had before, so nobody's numbers move until they pick another.
alter table user_settings add column projection_days text not null
  default 'weekdays'
  check (projection_days in ('every_day', 'weekdays', 'weekdays_except_holidays'));
