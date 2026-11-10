-- Stint is free (#718): every invoice document opens, so the Stripe mirror
-- and the plan stamped on each invoice go.

drop trigger t_invoices_issued_subscription_status on invoices;
drop function stamp_issued_subscription_status();
alter table invoices drop column issued_subscription_status;
drop table subscriptions;
