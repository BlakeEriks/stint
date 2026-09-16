-- Restore the seeded account, without the whole-database rebuild `supabase
-- db reset` performs: that takes every other account with it, including one
-- someone is tracking real time against on the local stack.
--
-- Deletes exactly that user's rows and lets `seed.sql` put them back. Order
-- matters: invoices reference clients and projects, and time entries
-- reference invoices, so the children go first.
--
-- `auth.users` is NOT touched. Removing the row would cascade into
-- `user_settings` via the signup trigger and invalidate any session.

begin;

delete from invoice_line_items
 where invoice_id in (
   select id from invoices
    where user_id = '00000000-0000-4000-8000-000000000001'
 );

delete from time_entries
 where user_id = '00000000-0000-4000-8000-000000000001';

delete from invoices
 where user_id = '00000000-0000-4000-8000-000000000001';

delete from projects
 where user_id = '00000000-0000-4000-8000-000000000001';

delete from clients
 where user_id = '00000000-0000-4000-8000-000000000001';

delete from payment_profiles
 where user_id = '00000000-0000-4000-8000-000000000001';

-- Numbering is allocated from here, so a restored account that kept a high
-- `next_invoice_number` would issue STINT-0003 where the suite expects
-- STINT-0001 to be the first thing it sees.
update user_settings
   set next_invoice_number = 1
 where user_id = '00000000-0000-4000-8000-000000000001';

commit;
