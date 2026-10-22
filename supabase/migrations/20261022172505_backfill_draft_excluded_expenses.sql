-- #433: a draft made before refreshing held exactly the expenses it billed.
-- Any unbilled one-off for its client dated within its period was left off,
-- or added since; either way a refresh must not add what the user didn't
-- pick, so each is recorded as left off.
update invoices i
   set excluded_expense_ids = coalesce((
         select array_agg(e.id order by e.id)
           from expenses e
          where e.user_id = i.user_id
            and e.client_id = i.client_id
            and e.invoice_id is null
            and not e.recurring
            and e.spent_on <= i.period_end
       ), '{}')
 where i.status = 'draft';
