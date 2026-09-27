-- Existing accounts get the 12-hour default too: every one of them had the
-- runaway-timer check this replaces.
update user_settings set max_entry_hours = 12 where max_entry_hours is null;
