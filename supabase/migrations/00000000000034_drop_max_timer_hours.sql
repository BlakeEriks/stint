-- Retired by #109, which removed the runaway timer and every read of it.
-- Its check constraint drops with it.
alter table user_settings drop column max_timer_hours;
