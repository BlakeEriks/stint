-- The strange-duration row's long side is on by default, at 12 hours: it is
-- how a timer left running overnight reaches the inbox once it is stopped.
-- `max_timer_hours` is no longer read and is dropped in a later release.
alter table user_settings alter column max_entry_hours set default 12;
