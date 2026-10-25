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

-- Generate used to store every draft's due date, typed or not. One its terms
-- would give is indistinguishable from untyped, so it goes back to following
-- them from the send; any other was typed, and stays.
update invoices i
   set due_date = null,
       payment_terms = case d.days when 0 then 'Due on receipt'
                                  else 'Net ' || d.days end
  from (
    select i2.id, coalesce(c.payment_terms_days, s.payment_terms_days) as days
      from invoices i2
      join clients c on c.id = i2.client_id
      join user_settings s on s.user_id = i2.user_id
     where i2.status = 'draft'
  ) d
 where i.id = d.id
   and i.due_date - i.issue_date = d.days;
