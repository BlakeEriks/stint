-- Stint is free (#718): every invoice document opens, so nothing stamps a
-- plan on an invoice any more. The column and `subscriptions` stay until
-- this build is live: the build before it still reads both while the
-- release gate migrates, so a later migration drops them.

drop trigger t_invoices_issued_subscription_status on invoices;
drop function stamp_issued_subscription_status();
