-- #382: every account that exists now predates the welcome dialog, so it is
-- marked welcomed and never sees it.
update user_settings set welcomed_at = now() where welcomed_at is null;
