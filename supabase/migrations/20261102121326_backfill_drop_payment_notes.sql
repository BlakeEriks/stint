-- A draft's frozen payment details carry `notes` from before the field was
-- dropped, and its downloaded snapshot a copy of them. Choosing payment
-- details again freezes them without it, which Mark sent would read as a
-- change since the PDF. Issued invoices keep theirs: they are frozen, and
-- nothing reads the key.
--
-- `touch_updated_at` is off for this statement: a backfill is not an edit.
alter table invoices disable trigger t_invoices_touch;

update invoices
   set payment_details = payment_details - 'notes',
       downloaded_snapshot = case
         when downloaded_snapshot #> '{printed,paymentDetails}' ? 'notes'
         then downloaded_snapshot #- '{printed,paymentDetails,notes}'
         else downloaded_snapshot
       end
 where status = 'draft'
   and payment_details ? 'notes';

alter table invoices enable trigger t_invoices_touch;
