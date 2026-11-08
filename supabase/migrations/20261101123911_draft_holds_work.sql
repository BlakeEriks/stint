-- #596: a draft holds the work it was built with, and changes only when the
-- owner changes it. `draft_id` marks an unbilled entry or one-off expense as
-- held by one draft, so no other draft offers it; `invoice_id` still means
-- billed, so everything that reads "unbilled" reads held work as unbilled.
-- Building a draft (`create_invoice`, `update_draft`, `hold_draft_work`)
-- holds work; `send_draft` bills it and lets go; deleting a draft releases
-- it through the key.
--
-- One column is one draft, so two drafts over the same dates can no longer
-- show the same work, and the one-draft-per-date check goes.

create unique index invoices_id_user_idx on invoices (id, user_id);

-- Composite, so a draft can only hold its own user's work.
alter table time_entries
  add column draft_id uuid,
  add constraint time_entries_draft_same_owner
    foreign key (draft_id, user_id) references invoices (id, user_id)
    on delete set null (draft_id);
create index time_entries_draft_idx on time_entries (draft_id) where draft_id is not null;

alter table expenses
  add column draft_id uuid,
  add constraint expenses_draft_same_owner
    foreign key (draft_id, user_id) references invoices (id, user_id)
    on delete set null (draft_id);
create index expenses_draft_idx on expenses (draft_id) where draft_id is not null;

-- An entry moved to another client leaves its draft, which no longer prices
-- it, and becomes new work for the other client's drafts. An expense's
-- client can't be changed through the API, so it needs no such rule.
create function release_moved_entry() returns trigger
language plpgsql as $$
begin
  if new.draft_id is not null
     and new.project_id is distinct from old.project_id
     and (select client_id from projects where id = new.project_id)
         is distinct from (select client_id from invoices where id = new.draft_id) then
    new.draft_id := null;
  end if;
  return new;
end $$;
create trigger t_entries_release_moved before update on time_entries
  for each row execute function release_moved_entry();

-- A project moved to another client takes its entries with it, so the ones a
-- draft of the old client holds leave that draft the same way. Expenses
-- carry no project.
create function release_moved_project() returns trigger
language plpgsql as $$
begin
  update time_entries e set draft_id = null
    from invoices i
   where e.project_id = new.id
     and i.id = e.draft_id
     and i.client_id is distinct from new.client_id;
  return null;
end $$;
create trigger t_projects_release_moved after update of client_id on projects
  for each row when (new.client_id is distinct from old.client_id)
  execute function release_moved_project();

-- Holds what the route built, of the work still unbilled and held by no
-- other draft; work taken meanwhile is simply not held. Only a draft holds:
-- one sent or deleted since the route read it is refused.
create function hold_draft_work(
  p_invoice_id  uuid,
  p_entry_ids   uuid[],
  p_expense_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform 1 from invoices where id = p_invoice_id and status = 'draft' for update;
  if not found then
    raise exception 'Invoice % is not a draft', p_invoice_id
      using errcode = 'check_violation', hint = 'INVOICE_STATUS_CHANGED';
  end if;
  update time_entries set draft_id = p_invoice_id
   where id = any(p_entry_ids)
     and invoice_id is null
     and (draft_id is null or draft_id = p_invoice_id);
  update expenses set draft_id = p_invoice_id
   where id = any(p_expense_ids)
     and not recurring
     and invoice_id is null
     and (draft_id is null or draft_id = p_invoice_id);
end $$;

revoke all on function hold_draft_work(uuid, uuid[], uuid[]) from public, anon;
grant execute on function hold_draft_work(uuid, uuid[], uuid[]) to authenticated;

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
