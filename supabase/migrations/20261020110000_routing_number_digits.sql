-- #333: a routing number is stored as its 9 digits, so no write path can
-- save one an invoice would print malformed. The ABA checksum stays in
-- `validateRoutingNumber()` alone; a copy here would need a parity test.
alter table payment_profiles
  add constraint payment_profiles_routing_number_digits
  check (routing_number ~ '^[0-9]{9}$');
