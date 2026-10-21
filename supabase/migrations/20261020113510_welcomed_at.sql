-- #382: when the welcome dialog was finished or skipped; null shows it. The
-- signup trigger leaves it null, so a new account sees the dialog.
alter table user_settings add column welcomed_at timestamptz;
