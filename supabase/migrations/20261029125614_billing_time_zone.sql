-- The IANA zone an account's invoices read their period, issue date and due
-- date in. The API validates the name. Null falls back to the device's zone.
alter table user_settings add column billing_time_zone text;
