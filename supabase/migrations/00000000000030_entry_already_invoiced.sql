-- An invoice is issued only if it attaches every entry it bills (#193).
--
-- The entries update skipped an entry another invoice had claimed and issued
-- anyway, so two racing generations billed the same hours twice and the
-- second invoice held no entries. It now raises `ENTRY_ALREADY_INVOICED`, as
-- the expenses update raises `EXPENSE_ALREADY_INVOICED`, which rolls the
-- whole call back, number included.

-- As in 00000000000029_invoice_summary.sql, checking the entries update.
create or replace function create_invoice(
  p_user_id     uuid,
  p_invoice     jsonb,
  p_entry_ids   uuid[],
  p_expense_ids uuid[]
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_alloc    record;
  v_invoice  invoices;
  v_details  jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
  v_attached integer;
begin
  select * into v_alloc from allocate_invoice_number(p_user_id);
  if v_alloc.sequence_no is null then
    raise exception 'Could not allocate an invoice number';
  end if;

  if v_details is not null then
    v_details := jsonb_set(
      v_details,
      '{fields}',
      coalesce(v_details->'fields', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
             'label', 'Payment reference', 'value', v_alloc.invoice_number))
    );
  end if;

  insert into invoices (
    user_id, client_id, invoice_number, sequence_no, status,
    issue_date, due_date, period_start, period_end,
    subtotal, tax_rate, tax_amount, expenses_subtotal, total, currency,
    notes, payment_terms, grouping_mode, payment_details,
    summary_text, reference, supporting_detail
  ) values (
    p_user_id,
    (p_invoice->>'client_id')::uuid,
    v_alloc.invoice_number,
    v_alloc.sequence_no,
    'draft',
    (p_invoice->>'issue_date')::date,
    (p_invoice->>'due_date')::date,
    (p_invoice->>'period_start')::date,
    (p_invoice->>'period_end')::date,
    (p_invoice->>'subtotal')::numeric,
    (p_invoice->>'tax_rate')::numeric,
    (p_invoice->>'tax_amount')::numeric,
    (p_invoice->>'expenses_subtotal')::numeric,
    (p_invoice->>'total')::numeric,
    p_invoice->>'currency',
    p_invoice->>'notes',
    p_invoice->>'payment_terms',
    p_invoice->>'grouping_mode',
    v_details,
    p_invoice->>'summary_text',
    nullif(p_invoice->>'reference', ''),
    nullif(p_invoice->'supporting_detail', 'null'::jsonb)
  )
  returning * into v_invoice;

  insert into invoice_line_items (
    invoice_id, description, unit, quantity, unit_price, amount, sort_order, spent_on
  )
  select
    v_invoice.id,
    l->>'description',
    l->>'unit',
    (l->>'quantity')::numeric,
    (l->>'unit_price')::numeric,
    (l->>'amount')::numeric,
    (ord - 1)::integer,
    (l->>'spent_on')::date
  from jsonb_array_elements(p_invoice->'lines') with ordinality as t(l, ord);

  update time_entries
     set invoice_id = v_invoice.id
   where id = any(p_entry_ids)
     and user_id = p_user_id
     and invoice_id is null;     -- never steal an entry another invoice claimed
  get diagnostics v_attached = row_count;

  if v_attached <> cardinality(p_entry_ids) then
    raise exception 'ENTRY_ALREADY_INVOICED: % of % entries were already on another invoice',
      cardinality(p_entry_ids) - v_attached, cardinality(p_entry_ids);
  end if;

  update expenses
     set invoice_id = v_invoice.id
   where id = any(p_expense_ids)
     and user_id = p_user_id
     and invoice_id is null;
  get diagnostics v_attached = row_count;

  if v_attached <> cardinality(p_expense_ids) then
    raise exception 'EXPENSE_ALREADY_INVOICED: % of % expenses were already on another invoice',
      cardinality(p_expense_ids) - v_attached, cardinality(p_expense_ids);
  end if;

  return v_invoice;
end $$;

revoke all on function create_invoice(uuid, jsonb, uuid[], uuid[]) from public, anon;
grant execute on function create_invoice(uuid, jsonb, uuid[], uuid[]) to authenticated;
