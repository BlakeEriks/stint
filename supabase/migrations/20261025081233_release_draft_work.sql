-- #452: a draft holds no work, so each releases its entries and one-off
-- expenses and keeps only its manual charges. Its totals are derived on read
-- and written when it is sent.
update time_entries t
   set invoice_id = null
  from invoices i
 where t.invoice_id = i.id and i.status = 'draft';

update expenses e
   set invoice_id = null
  from invoices i
 where e.invoice_id = i.id and i.status = 'draft';

delete from invoice_line_items l
 using invoices i
 where l.invoice_id = i.id and i.status = 'draft' and l.unit <> 'fixed';

update invoices
   set subtotal = 0, tax_amount = 0, expenses_subtotal = 0, total = 0
 where status = 'draft';
