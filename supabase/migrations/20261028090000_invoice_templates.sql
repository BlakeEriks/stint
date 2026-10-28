-- #461: four invoice templates. The account picks one; a draft renders in it,
-- and Mark sent freezes the one the client's PDF was drawn in onto the
-- invoice, where `guard_issued_invoice` keeps it with every column it does
-- not name.
alter table user_settings
  add column invoice_template text not null default 'standard'
    check (invoice_template in ('standard', 'modern', 'classic', 'creative'));

-- Every invoice sent before templates was drawn in Standard, which the
-- default gives it without touching a row. A draft's value means nothing
-- until Mark sent writes it.
alter table invoices
  add column template text not null default 'standard'
    check (template in ('standard', 'modern', 'classic', 'creative'));

create or replace function send_draft(
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
    raise exception 'Invoice % is % and cannot be sent', p_invoice_id, v_invoice.status
      using errcode = 'check_violation', hint = 'INVOICE_STATUS_CHANGED';
  end if;

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
     and invoice_id is null;     -- never steal an entry another invoice claimed
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(p_entry_ids) then
    raise exception '% of % entries were billed elsewhere or deleted',
      cardinality(p_entry_ids) - v_attached, cardinality(p_entry_ids)
      using hint = 'ENTRY_ALREADY_INVOICED';
  end if;

  update expenses
     set invoice_id = p_invoice_id
   where id = any(p_expense_ids)
     and user_id = v_invoice.user_id
     and invoice_id is null;
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(p_expense_ids) then
    raise exception '% of % expenses were already on another invoice',
      cardinality(p_expense_ids) - v_attached, cardinality(p_expense_ids)
      using hint = 'EXPENSE_ALREADY_INVOICED';
  end if;

  update invoices set
    subtotal          = (p_invoice->>'subtotal')::numeric,
    tax_rate          = (p_invoice->>'tax_rate')::numeric,
    tax_amount        = (p_invoice->>'tax_amount')::numeric,
    expenses_subtotal = (p_invoice->>'expenses_subtotal')::numeric,
    total             = (p_invoice->>'total')::numeric,
    supporting_detail = nullif(p_invoice->'supporting_detail', 'null'::jsonb),
    issue_date        = (p_invoice->>'issue_date')::date,
    due_date          = (p_invoice->>'due_date')::date,
    payment_terms     = p_invoice->>'payment_terms',
    tz                = p_invoice->>'tz',
    template          = p_invoice->>'template',
    status            = 'sent',
    sent_at           = p_sent_at
   where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end $$;

