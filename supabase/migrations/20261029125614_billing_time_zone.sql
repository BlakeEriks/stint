-- The IANA zone an invoice reads its period, issue date and due date in:
-- the client's, else the account's. The API validates the name. Null on the
-- account falls back to the device's zone; null on a client follows the
-- account's.
alter table user_settings add column billing_time_zone text;
alter table clients add column billing_time_zone text;
