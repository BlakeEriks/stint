-- A draft has no number, issue date or terms until its PDF is first
-- rendered: number_invoice() gives it all of them at that moment, so a draft
-- deleted before it could reach a client leaves no gap in the sequence.
-- Drafts numbered before this keep their numbers.
alter table invoices
  alter column invoice_number drop not null,
  alter column sequence_no drop not null,
  alter column issue_date drop not null,
  alter column issue_date drop default,
  add constraint invoice_issued_numbered check (
    status = 'draft'
    or (invoice_number is not null and sequence_no is not null and issue_date is not null)
  ),
  -- Made by the daily job, which may delete it if its period bills nothing.
  add column auto boolean not null default false,
  -- Claimed before the ready email is sent, released if sending fails.
  add column ready_emailed_at timestamptz;

-- The job makes one draft per client and period, however often it runs.
create unique index invoices_one_auto_draft_per_period
  on invoices (user_id, client_id, period_start, period_end)
  where auto and status = 'draft';

-- The last period the job drafted for a client, so a draft the user
-- deleted isn't made again.
alter table clients add column auto_drafted_through date;

alter table user_settings
  -- Where "period ended" is judged; null is UTC until the app records one.
  add column time_zone text,
  add column auto_drafts boolean not null default true,
  add column ready_email boolean not null default true;

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
  v_invoice  invoices;
  v_details  jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
  v_attached integer;
begin
  insert into invoices (
    user_id, client_id, invoice_number, sequence_no, status,
    issue_date, due_date, period_start, period_end,
    subtotal, tax_rate, tax_amount, expenses_subtotal, total, currency,
    notes, payment_terms, grouping_mode, payment_details,
    summary_text, reference, supporting_detail,
    tz, excluded_expense_ids, auto
  ) values (
    p_user_id,
    (p_invoice->>'client_id')::uuid,
    null,
    null,
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
    ),
    coalesce((p_invoice->>'auto')::boolean, false)
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

create function number_invoice(
  p_invoice_id uuid,
  p_issue_date date,
  p_due_date   date,
  p_terms      text
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_invoice invoices;
  v_alloc   record;
begin
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if v_invoice.invoice_number is not null then
    return v_invoice;
  end if;

  select * into v_alloc from allocate_invoice_number(v_invoice.user_id);

  update invoices
     set invoice_number = v_alloc.invoice_number,
         sequence_no    = v_alloc.sequence_no,
         issue_date     = p_issue_date,
         due_date       = p_due_date,
         payment_terms  = p_terms,
         payment_details = case
           when payment_details is null then null
           else jsonb_set(
             payment_details,
             '{fields}',
             coalesce(payment_details->'fields', '[]'::jsonb)
               || jsonb_build_array(jsonb_build_object(
                    'label', 'Payment reference', 'value', v_alloc.invoice_number))
           )
         end
   where id = p_invoice_id
  returning * into v_invoice;
  return v_invoice;
end $$;

revoke all on function number_invoice(uuid, date, date, text) from public, anon;
grant execute on function number_invoice(uuid, date, date, text) to authenticated;
