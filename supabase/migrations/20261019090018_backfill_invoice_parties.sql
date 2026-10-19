-- #231: invoices generated before 20261019090015_invoice_parties.sql are
-- frozen with the details their PDF prints today. What one printed before an
-- earlier edit was never recorded, so today's is the closest copy there is,
-- and nothing visibly changes on deploy.
--
-- `guard_issued_invoice` refuses any change to an issued invoice, so it is
-- off for this statement, and `touch_updated_at` with it: a backfill is not
-- an edit.
alter table invoices disable trigger t_invoices_guard_issued;
alter table invoices disable trigger t_invoices_touch;

update invoices i
   set business_name    = s.business_name,
       business_address = s.business_address,
       business_email   = s.business_email,
       logo_url         = s.logo_url,
       client_name      = c.name,
       client_email     = c.email,
       client_address   = c.address
  from user_settings s, clients c
 where s.user_id = i.user_id
   and c.id = i.client_id;

alter table invoices enable trigger t_invoices_guard_issued;
alter table invoices enable trigger t_invoices_touch;
