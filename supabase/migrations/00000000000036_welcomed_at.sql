-- When the welcome dialog (#382) was finished or skipped; null shows it.
-- Every account that exists now predates the dialog, so it is marked
-- welcomed here and never sees it. The signup trigger leaves it null.
alter table user_settings add column welcomed_at timestamptz;

update user_settings set welcomed_at = now();
