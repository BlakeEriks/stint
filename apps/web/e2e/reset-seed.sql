-- Restore the seeded account, without the whole-database rebuild `supabase
-- db reset` performs: that takes every other account with it, including one
-- someone is tracking real time against on the local stack.
--
-- Deletes exactly that user's rows and lets `seed.sql` put them back.
--
-- **Invoices go before time entries.** `guard_billed_entry_delete` raises on
-- an entry billed to a non-draft invoice, so deleting entries first fails
-- the moment the seed contains any invoiced work — which it does, 118 rows
-- of it. Deleting the invoice releases its entries by the same FK rule
-- (`on delete set null`) that voiding uses in the app, and the entry delete
-- below then succeeds. `scripts/seed-account.mjs` orders it the same way and
-- says so for the same reason.
--
-- `auth.users` is NOT touched. Removing the row would cascade into
-- `user_settings` via the signup trigger and invalidate any session.

begin;

delete from invoice_line_items
 where invoice_id in (
   select id from invoices
    where user_id = '00000000-0000-4000-8000-000000000001'
 );

delete from invoices
 where user_id = '00000000-0000-4000-8000-000000000001';

delete from time_entries
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
-- The goal too: `seed.sql` sets 110 hours, and a settings row left at
-- whatever a previous run or a manual edit put there makes the Pace region
-- plot against a target the seed did not choose — or hides it entirely, when
-- the target is null.
update user_settings
   set next_invoice_number = 1,
       monthly_target      = 110,
       monthly_target_unit = 'hours'
 where user_id = '00000000-0000-4000-8000-000000000001';

commit;
