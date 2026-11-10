-- A summary line per rate takes its own text. `summary_texts` holds the
-- ones typed themselves, `[{ "rate": 195, "text": "…" }]`; a rate with none
-- prints `summary_text`. Empty for every other grouping, as `summary_text`
-- is null. `create_invoice` and `update_draft` write it beside
-- `summary_text`, as `20261101123911_draft_holds_work.sql` has them.

alter table invoices
  add column summary_texts jsonb not null default '[]'::jsonb
    constraint invoices_summary_texts_check
    check (jsonb_typeof(summary_texts) = 'array');

create or replace function create_invoice(
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
  v_invoice invoices;
  v_details jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
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
    due_date, period_start, period_end,
    currency, notes, payment_terms, grouping_mode, payment_details,
    summary_text, summary_texts, reference, supporting_detail,
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
    coalesce(p_invoice->'summary_texts', '[]'::jsonb),
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

  perform hold_draft_work(
    v_invoice.id,
    coalesce(array(select jsonb_array_elements_text(p_invoice->'entry_ids'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(p_invoice->'expense_ids'))::uuid[], '{}')
  );

  return v_invoice;
end $$;

-- An edit is a build: the draft holds what it built and lets go of the rest.
create or replace function update_draft(
  p_invoice_id uuid,
  p_invoice    jsonb
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_invoice  invoices;
  v_details  jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
  v_entries  uuid[] := coalesce(
    array(select jsonb_array_elements_text(p_invoice->'entry_ids'))::uuid[], '{}');
  v_expenses uuid[] := coalesce(
    array(select jsonb_array_elements_text(p_invoice->'expense_ids'))::uuid[], '{}');
begin
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'Invoice % not found', p_invoice_id
      using errcode = 'no_data_found';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Invoice % is % and cannot be edited', p_invoice_id, v_invoice.status
      using errcode = 'check_violation', hint = 'INVOICE_STATUS_CHANGED';
  end if;

  -- Absent, the draft keeps the payment details it was frozen with.
  if p_invoice ? 'payment_details' then
    if v_details is not null then
      v_details := jsonb_set(
        v_details,
        '{fields}',
        coalesce(v_details->'fields', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
               'label', 'Payment reference', 'value', v_invoice.invoice_number))
      );
    end if;
  else
    v_details := v_invoice.payment_details;
  end if;

  update invoices set
    due_date             = (p_invoice->>'due_date')::date,
    period_start         = (p_invoice->>'period_start')::date,
    period_end           = (p_invoice->>'period_end')::date,
    notes                = p_invoice->>'notes',
    grouping_mode        = p_invoice->>'grouping_mode',
    summary_text         = p_invoice->>'summary_text',
    summary_texts        = coalesce(p_invoice->'summary_texts', '[]'::jsonb),
    supporting_detail    = nullif(p_invoice->'supporting_detail', 'null'::jsonb),
    reference            = nullif(p_invoice->>'reference', ''),
    payment_details      = v_details,
    tz                   = p_invoice->>'tz',
    excluded_expense_ids = coalesce(
      array(select jsonb_array_elements_text(p_invoice->'excluded_expense_ids'))::uuid[],
      '{}'
    )
   where id = p_invoice_id
  returning * into v_invoice;

  delete from invoice_line_items where invoice_id = p_invoice_id;
  insert into invoice_line_items (
    invoice_id, description, unit, quantity, unit_price, amount, sort_order
  )
  select
    p_invoice_id,
    l->>'description',
    'fixed',
    1,
    (l->>'amount')::numeric,
    (l->>'amount')::numeric,
    (ord - 1)::integer
  from jsonb_array_elements(p_invoice->'manual_lines') with ordinality as t(l, ord);

  update time_entries set draft_id = null
   where draft_id = p_invoice_id and not (id = any(v_entries));
  update expenses set draft_id = null
   where draft_id = p_invoice_id and not (id = any(v_expenses));
  perform hold_draft_work(p_invoice_id, v_entries, v_expenses);

  return v_invoice;
end $$;
