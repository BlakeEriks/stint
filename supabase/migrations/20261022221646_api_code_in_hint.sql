-- #376: each refusal a route translates raises its API code in HINT, so the
-- route matches the code rather than the wording (`dbCode` in
-- apps/web/src/lib/errors.ts). The bodies are otherwise as last defined.

create or replace function guard_billed_entry() returns trigger
language plpgsql as $$
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
     or new.user_id    is distinct from old.user_id
     -- task_name becomes the invoice line description: editing it after
     -- issue changes what the client was told they were billed for.
     or new.task_name is distinct from old.task_name then
    raise exception 'Entry % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation', hint = 'ENTRY_LOCKED';
  end if;

  return new;
end $$;

create or replace function guard_billed_entry_delete() returns trigger
language plpgsql as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then return old; end if;
  select status into inv_status from invoices where id = old.invoice_id;
  if inv_status is not null and inv_status <> 'draft' then
    raise exception 'Entry % is billed on a % invoice and cannot be deleted', old.id, inv_status
      using errcode = 'check_violation', hint = 'ENTRY_LOCKED';
  end if;
  return old;
end $$;

create or replace function guard_billed_expense() returns trigger
language plpgsql as $$
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

  if new.invoice_id is distinct from old.invoice_id and new.invoice_id is null then
    return new;
  end if;

  if new.spent_on       is distinct from old.spent_on
     or new.description is distinct from old.description
     or new.amount      is distinct from old.amount
     or new.client_id   is distinct from old.client_id
     or new.recurring   is distinct from old.recurring then
    raise exception 'Expense % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation', hint = 'EXPENSE_LOCKED';
  end if;

  return new;
end $$;

create or replace function guard_billed_expense_delete() returns trigger
language plpgsql as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then return old; end if;
  select status into inv_status from invoices where id = old.invoice_id;
  if inv_status is not null and inv_status <> 'draft' then
    raise exception 'Expense % is billed on a % invoice and cannot be deleted', old.id, inv_status
      using errcode = 'check_violation', hint = 'EXPENSE_LOCKED';
  end if;
  return old;
end $$;

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
    summary_text, reference, supporting_detail,
    tz, excluded_expense_ids
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
    nullif(p_invoice->'supporting_detail', 'null'::jsonb),
    p_invoice->>'tz',
    coalesce(
      array(select jsonb_array_elements_text(p_invoice->'excluded_expense_ids'))::uuid[],
      '{}'
    )
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
    raise exception '% of % entries were billed elsewhere or deleted',
      cardinality(p_entry_ids) - v_attached, cardinality(p_entry_ids)
      using hint = 'ENTRY_ALREADY_INVOICED';
  end if;

  update expenses
     set invoice_id = v_invoice.id
   where id = any(p_expense_ids)
     and user_id = p_user_id
     and invoice_id is null;
  get diagnostics v_attached = row_count;

  if v_attached <> cardinality(p_expense_ids) then
    raise exception '% of % expenses were already on another invoice',
      cardinality(p_expense_ids) - v_attached, cardinality(p_expense_ids)
      using hint = 'EXPENSE_ALREADY_INVOICED';
  end if;

  return v_invoice;
end $$;

revoke all on function create_invoice(uuid, jsonb, uuid[], uuid[]) from public, anon;
grant execute on function create_invoice(uuid, jsonb, uuid[], uuid[]) to authenticated;

create or replace function refresh_draft(
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
    raise exception 'Invoice % is % and cannot be refreshed', p_invoice_id, v_invoice.status
      using errcode = 'check_violation', hint = 'INVOICE_STATUS_CHANGED';
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
