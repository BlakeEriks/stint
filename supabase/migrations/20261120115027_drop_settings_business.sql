-- #838: the business lives in `business_profiles` now
-- (`20261120115024_backfill_business_profiles.sql` copied it there).
alter table user_settings
  drop column business_name,
  drop column business_address,
  drop column business_email,
  drop column logo_url;
