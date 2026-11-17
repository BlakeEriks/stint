-- #758: a billed entry's task name renames freely, as a project's does.
-- Sending froze every name the invoice prints (line descriptions, client,
-- `supporting_detail`), so the lock protected nothing on the document and
-- left a task spanning periods under two names. What moves money, rollups
-- or ownership stays locked. The body is otherwise as last defined.
--
-- Invoker again, as before 20261110103554_connected_app_fence: a connected
-- app may change only task_name (`t_entries_app_changes`, which fires
-- first), so with task_name free it never reaches the lock; every other
-- caller can read the invoice its entry is billed on.

create or replace function guard_billed_entry() returns trigger
language plpgsql
as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then
    return new;
  end if;

  select status into inv_status from invoices where id = old.invoice_id;

  if inv_status is null or inv_status = 'draft' then
    return new;
  end if;

  -- Allow only detachment from the invoice (void/unbill path).
  if new.invoice_id is distinct from old.invoice_id and new.invoice_id is null then
    return new;
  end if;

  if new.started_at    is distinct from old.started_at
     or new.ended_at   is distinct from old.ended_at
     or new.is_billable is distinct from old.is_billable
     or new.rate_override is distinct from old.rate_override
     or new.project_id is distinct from old.project_id
     -- An entry billed on someone's invoice must stay theirs.
     or new.user_id    is distinct from old.user_id then
    raise exception 'Entry % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation', hint = 'ENTRY_LOCKED';
  end if;

  return new;
end $$;
