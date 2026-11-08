-- #551: a draft is edited, not deleted and made again. `update_draft` writes
-- every choice New invoice makes but the client, and replaces the draft's
-- charges, in one transaction.
--
-- Its overlap check runs under the user's counter row lock, the one
-- `create_invoice` takes through `allocate_invoice_number`, so an edit and a
-- Generate moving onto the same dates at once see each other. A draft
-- claims no work, so moving its dates releases nothing.

create function update_draft(
  p_invoice_id uuid,
  p_invoice    jsonb
)
returns invoices
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  v_invoice invoices;
  v_open    invoices;
  v_details jsonb := nullif(p_invoice->'payment_details', 'null'::jsonb);
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

  perform 1 from user_settings where user_id = v_invoice.user_id for update;

  select * into v_open
    from invoices
   where user_id = v_invoice.user_id
     and client_id = v_invoice.client_id
     and status = 'draft'
     and id <> p_invoice_id
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

  return v_invoice;
end $$;

revoke all on function update_draft(uuid, jsonb) from public, anon;
grant execute on function update_draft(uuid, jsonb) to authenticated;
