-- A draft downloaded before its snapshot kept what the PDF printed besides
-- the lines would let an edit to any of it through Mark sent. Nothing could
-- edit a draft until `update_draft`, so its own columns are what that PDF
-- printed, and they become the snapshot's `printed`. The attachments are
-- left out: they are derived from the work, and a field the snapshot lacks
-- compares as unchanged.
--
-- `touch_updated_at` is off for this statement: a backfill is not an edit.
alter table invoices disable trigger t_invoices_touch;

update invoices
   set downloaded_snapshot = downloaded_snapshot || jsonb_build_object(
         'printed', jsonb_build_object(
           'periodStart',    period_start,
           'periodEnd',      period_end,
           'typedDueDate',   due_date,
           'notes',          notes,
           'reference',      reference,
           'paymentDetails', payment_details,
           'tz',             tz
         )
       )
 where status = 'draft'
   and downloaded_snapshot is not null
   and not downloaded_snapshot ? 'printed';

alter table invoices enable trigger t_invoices_touch;
