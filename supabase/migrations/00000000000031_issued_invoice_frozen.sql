-- An issued invoice, its lines and its status are frozen by the database
-- (#196), as the entries and expenses it bills already were.
--
-- `authenticated` holds `update` on `invoices` and `invoice_line_items`, so
-- before this a caller with their own JWT could rewrite a sent invoice's
-- total through PostgREST, or move it back to `draft` and so unlock every
-- entry it billed. Voiding also released what it billed in statements apart
-- from the void, so a failure between them left a void invoice holding
-- entries that could never be billed again.

-- Every column but the status and its two dates is the document the client
-- was sent, so the comparison names what may change rather than what may
-- not: a column added later is frozen without anyone remembering to list it.
-- `updated_at` is `touch_updated_at`'s.
create function guard_issued_invoice() returns trigger
language plpgsql as $$
declare
  mutable constant text[] := array['status', 'sent_at', 'paid_at', 'updated_at'];
begin
  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('draft', 'sent'), ('draft', 'void'),
       ('sent', 'paid'), ('sent', 'void'),
       ('paid', 'void')
     ) then
    raise exception 'Invoice % cannot move from % to %', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  if old.status <> 'draft'
     and to_jsonb(new) - mutable is distinct from to_jsonb(old) - mutable then
    raise exception 'Invoice % is % and cannot be modified', old.id, old.status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger t_invoices_guard_issued before update on invoices
  for each row execute function guard_issued_invoice();

-- Insert is guarded too: a line added to a sent invoice rewrites it as
-- surely as one edited. A line whose invoice is gone passes, which is how a
-- deleted invoice's lines cascade.
create function guard_issued_line_item() returns trigger
language plpgsql as $$
declare
  inv invoices;
begin
  select * into inv
    from invoices
   where id in (old.invoice_id, new.invoice_id) and status <> 'draft'
   limit 1;

  if inv.id is not null then
    raise exception 'Invoice % is % and its lines cannot be modified', inv.id, inv.status
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end $$;

create trigger t_line_items_guard_issued
  before insert or update or delete on invoice_line_items
  for each row execute function guard_issued_line_item();

-- Releasing in a trigger rather than in the route makes the release part of
-- the statement that voids, whichever client wrote it.
create function release_voided_invoice() returns trigger
language plpgsql as $$
begin
  update time_entries set invoice_id = null where invoice_id = new.id;
  update expenses     set invoice_id = null where invoice_id = new.id;
  return null;
end $$;

create trigger t_invoices_release_on_void after update of status on invoices
  for each row when (new.status = 'void' and old.status <> 'void')
  execute function release_voided_invoice();
