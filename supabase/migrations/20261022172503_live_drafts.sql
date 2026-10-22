-- #433: a draft keeps collecting its period's work until it is marked sent.
-- Each read refreshes it through `refresh_draft()`, which needs what the
-- user chose that the draft didn't record: the time zone its local dates
-- are read in, and the expenses left off. `downloaded_snapshot` is what the
-- PDF showed when last rendered, so Mark sent can tell the client got a
-- stale copy. All three freeze with the rest once the invoice leaves
-- `draft` (`guard_issued_invoice`).
alter table invoices
  add column tz text,
  add column excluded_expense_ids uuid[] not null default '{}',
  add column downloaded_snapshot jsonb;

-- Replaces a draft's lines with `p_invoice->'lines'` and what it holds with
-- `p_entry_ids` and `p_expense_ids`, in one transaction, as `create_invoice`
-- writes a new one: the route computes, this writes. `p_sent_at` also sends
-- it, so nothing logged between a refresh and the send is missed.
create function refresh_draft(
  p_invoice_id  uuid,
  p_invoice     jsonb,
  p_entry_ids   uuid[],
  p_expense_ids uuid[],
  p_sent_at     timestamptz
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_invoice  invoices;
  v_attached integer;
begin
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'Invoice % not found', p_invoice_id
      using errcode = 'no_data_found';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'INVOICE_NOT_DRAFT: Invoice % is % and cannot be refreshed', p_invoice_id, v_invoice.status
      using errcode = 'check_violation';
  end if;

  update time_entries set invoice_id = null where invoice_id = p_invoice_id;
  update expenses     set invoice_id = null where invoice_id = p_invoice_id;
  delete from invoice_line_items where invoice_id = p_invoice_id;

  insert into invoice_line_items (
    invoice_id, description, unit, quantity, unit_price, amount, sort_order, spent_on
  )
  select
    p_invoice_id,
    l->>'description',
    l->>'unit',
    (l->>'quantity')::numeric,
    (l->>'unit_price')::numeric,
    (l->>'amount')::numeric,
    (ord - 1)::integer,
    (l->>'spent_on')::date
  from jsonb_array_elements(p_invoice->'lines') with ordinality as t(l, ord);

  update time_entries
     set invoice_id = p_invoice_id
   where id = any(p_entry_ids)
     and user_id = v_invoice.user_id
     and invoice_id is null;
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(p_entry_ids) then
    raise exception 'ENTRY_ALREADY_INVOICED: % of % entries were billed elsewhere or deleted',
      cardinality(p_entry_ids) - v_attached, cardinality(p_entry_ids);
  end if;

  update expenses
     set invoice_id = p_invoice_id
   where id = any(p_expense_ids)
     and user_id = v_invoice.user_id
     and invoice_id is null;
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(p_expense_ids) then
    raise exception 'EXPENSE_ALREADY_INVOICED: % of % expenses were already on another invoice',
      cardinality(p_expense_ids) - v_attached, cardinality(p_expense_ids);
  end if;

  update invoices set
    subtotal          = (p_invoice->>'subtotal')::numeric,
    tax_rate          = (p_invoice->>'tax_rate')::numeric,
    tax_amount        = (p_invoice->>'tax_amount')::numeric,
    expenses_subtotal = (p_invoice->>'expenses_subtotal')::numeric,
    total             = (p_invoice->>'total')::numeric,
    supporting_detail = nullif(p_invoice->'supporting_detail', 'null'::jsonb),
    tz                = coalesce(tz, p_invoice->>'tz'),
    downloaded_snapshot = case when p_invoice ? 'downloaded_snapshot'
                               then p_invoice->'downloaded_snapshot'
                               else downloaded_snapshot end
   where id = p_invoice_id
  returning * into v_invoice;

  if p_sent_at is not null then
    update invoices set status = 'sent', sent_at = p_sent_at
     where id = p_invoice_id
    returning * into v_invoice;
  end if;

  return v_invoice;
end $$;

revoke all on function refresh_draft(uuid, jsonb, uuid[], uuid[], timestamptz) from public, anon;
grant execute on function refresh_draft(uuid, jsonb, uuid[], uuid[], timestamptz) to authenticated;
