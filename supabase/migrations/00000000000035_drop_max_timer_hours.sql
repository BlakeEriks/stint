-- Retired by #109, which removed the runaway timer and every read of it.
-- Its check constraint drops with it.
-- `if exists`: production ran this file as 00000000000034_drop_max_timer_hours.sql
-- before #303 renumbered it, and migrate.mjs keys on the filename, so it runs
-- here a second time.
alter table user_settings drop column if exists max_timer_hours;
