-- #231: an invoice's From and Bill to blocks are saved on it at generation,
-- as `payment_details` is, so editing the business or the client later never
-- reprints an invoice already sent. `guard_issued_invoice` freezes them once
-- issued, as it does every column it does not name.
--
-- Stamped by trigger, never taken from the caller, as
-- `issued_subscription_status` is: every insert path gets the same copy, and
-- no route has to remember to send it. `create_invoice` runs as the caller,
-- so these reads see only the caller's own rows.
alter table invoices
  add column business_name    text,
  add column business_address text,
  add column business_email   text,
  add column logo_url         text,
  add column client_name      text,
  add column client_email     text,
  add column client_address   text;

create function stamp_invoice_parties() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select s.business_name, s.business_address, s.business_email, s.logo_url
    into new.business_name, new.business_address, new.business_email, new.logo_url
    from user_settings s
   where s.user_id = new.user_id;

  select c.name, c.email, c.address
    into new.client_name, new.client_email, new.client_address
    from clients c
   where c.id = new.client_id;

  return new;
end $$;

create trigger t_invoices_stamp_parties before insert on invoices
  for each row execute function stamp_invoice_parties();
