-- #452: a draft is the user's choices, and its time and expense lines are
-- derived on every read without writing. It claims its work only when sent,
-- through `send_draft()`, so `refresh_draft()` goes.
--
-- `create_invoice` stores the choices and the manual charges (its `fixed`
-- lines) and claims nothing. Its overlap check runs after
-- `allocate_invoice_number` has taken the user's counter row lock, so of two
-- concurrent Generates over the same dates the second sees the first's draft.
-- A draft's issue date is its send date, so it is set then; `due_date` is
-- stored only when the user typed one, and otherwise follows the terms it
-- keeps in `payment_terms`.

drop function refresh_draft(uuid, jsonb, uuid[], uuid[], timestamptz);
drop function create_invoice(uuid, jsonb, uuid[], uuid[]);

create function create_invoice(
  p_user_id uuid,
  p_invoice jsonb
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_alloc   record;
  v_open    invoices;
  v_invoice invoices;
  v_details jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
begin
  select * into v_alloc from allocate_invoice_number(p_user_id);
  if v_alloc.sequence_no is null then
    raise exception 'Could not allocate an invoice number';
  end if;

  -- Two open drafts over one date would both show its work. DETAIL names the
  -- draft in the way, for the route's 409.
  select * into v_open
    from invoices
   where user_id = p_user_id
     and client_id = (p_invoice->>'client_id')::uuid
     and status = 'draft'
     and period_start <= (p_invoice->>'period_end')::date
     and period_end >= (p_invoice->>'period_start')::date
   limit 1;
  if v_open.id is not null then
    raise exception '% is a draft for these dates already', v_open.invoice_number
      using hint = 'DRAFT_OVERLAPS',
            detail = json_build_object(
              'invoiceId', v_open.id,
              'invoiceNumber', v_open.invoice_number,
              'periodStart', v_open.period_start,
              'periodEnd', v_open.period_end
            )::text;
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
    due_date, period_start, period_end,
    currency, notes, payment_terms, grouping_mode, payment_details,
    summary_text, reference, supporting_detail,
    tz, excluded_expense_ids
  ) values (
    p_user_id,
    (p_invoice->>'client_id')::uuid,
    v_alloc.invoice_number,
    v_alloc.sequence_no,
    'draft',
    (p_invoice->>'due_date')::date,
    (p_invoice->>'period_start')::date,
    (p_invoice->>'period_end')::date,
    p_invoice->>'currency',
    p_invoice->>'notes',
    p_invoice->>'payment_terms',
    p_invoice->>'grouping_mode',
    v_details,
    p_invoice->>'summary_text',
    nullif(p_invoice->>'reference', ''),
    nullif(p_invoice->'supporting_detail', 'null'::jsonb),
    p_invoice->>'tz',
    coalesce(
      array(select jsonb_array_elements_text(p_invoice->'excluded_expense_ids'))::uuid[],
      '{}'
    )
  )
  returning * into v_invoice;

  insert into invoice_line_items (
    invoice_id, description, unit, quantity, unit_price, amount, sort_order
  )
  select
    v_invoice.id,
    l->>'description',
    'fixed',
    1,
    (l->>'amount')::numeric,
    (l->>'amount')::numeric,
    (ord - 1)::integer
  from jsonb_array_elements(p_invoice->'manual_lines') with ordinality as t(l, ord);

  return v_invoice;
end $$;

revoke all on function create_invoice(uuid, jsonb) from public, anon;
grant execute on function create_invoice(uuid, jsonb) to authenticated;

-- Mark sent: writes the lines and totals the route computed, claims the
-- entries and one-off expenses they bill, dates the invoice and sends it, in
-- one transaction. Work another invoice claimed meanwhile rolls it all back.
create function send_draft(
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
    status            = 'sent',
    sent_at           = p_sent_at
   where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end $$;

revoke all on function send_draft(uuid, jsonb, uuid[], uuid[], timestamptz) from public, anon;
grant execute on function send_draft(uuid, jsonb, uuid[], uuid[], timestamptz) to authenticated;
