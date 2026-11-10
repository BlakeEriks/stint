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

-- Mark sent bills what the draft held, then lets go of it all: billed work
-- is the invoice's, and held work it didn't bill (made non-billable or
-- billed elsewhere since) is new work again.
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

  -- Only what this draft still holds, under its row lock: an edit that moved
  -- an entry to another draft since the route read it, or a billed-elsewhere
  -- mark, refuses the send rather than billing it here.
  update time_entries
     set invoice_id = p_invoice_id
   where id = any(p_entry_ids)
     and user_id = v_invoice.user_id
     and invoice_id is null     -- never steal an entry another invoice claimed
     and draft_id = p_invoice_id
     and not invoiced_elsewhere;
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
     and invoice_id is null
     and draft_id = p_invoice_id;
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(p_expense_ids) then
    raise exception '% of % expenses were already on another invoice',
      cardinality(p_expense_ids) - v_attached, cardinality(p_expense_ids)
      using hint = 'EXPENSE_ALREADY_INVOICED';
  end if;

  update time_entries set draft_id = null where draft_id = p_invoice_id;
  update expenses set draft_id = null where draft_id = p_invoice_id;

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
    template          = coalesce(p_invoice->>'template', template),
    status            = 'sent',
    sent_at           = p_sent_at
   where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end $$;
