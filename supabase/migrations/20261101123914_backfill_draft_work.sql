-- #596: each draft open when drafts began holding their work holds what it
-- showed the moment before: what `deriveDraft` priced from its period. That
-- is the last time a draft changes on its own.
--
-- Entries: the client's stopped, unbilled entries not billed elsewhere that
-- started in the period, read in the draft's zone, else UTC (the window
-- `billingWindow` takes). The one-draft-per-date rule held until now, so no
-- entry falls in two drafts' periods.
update time_entries e
   set draft_id = i.id
  from invoices i
  join projects p on p.client_id = i.client_id
 where i.status = 'draft'
   and e.project_id = p.id
   and e.user_id = i.user_id
   and e.invoice_id is null
   and not e.invoiced_elsewhere
   and e.ended_at is not null
   and e.started_at >= (i.period_start::timestamp at time zone coalesce(i.tz, 'UTC'))
   and e.started_at < ((i.period_end + 1)::timestamp at time zone coalesce(i.tz, 'UTC'));

-- One-off expenses: each to the client's open draft with the earliest end
-- on or after its date that didn't leave it off, as `assignExpenses` gave it.
update expenses x
   set draft_id = pick.draft_id
  from (
    select distinct on (x.id) x.id, i.id as draft_id
      from expenses x
      join invoices i
        on i.client_id = x.client_id
       and i.user_id = x.user_id
       and i.status = 'draft'
       and i.period_end >= x.spent_on
       and not (x.id = any(i.excluded_expense_ids))
     where not x.recurring
       and x.invoice_id is null
     order by x.id, i.period_end
  ) pick
 where x.id = pick.id;
