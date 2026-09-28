-- Reimbursable expenses: a cost the contractor paid that a client pays back
-- on the invoice. `specs/002-reimbursable-expenses/` has the reasoning.
--
-- An expense has an amount and no duration, so it is its own table rather
-- than a time entry: the timer index, the rate chain and every earned and
-- unbilled rollup read `time_entries`, and a reimbursement is not work.
-- Keeping it out of that table keeps it out of those figures by
-- construction, with no filter to forget.

-- ── expenses ───────────────────────────────────────────────────────
-- The composite key below needs a unique key on the referenced side, as
-- `projects_id_user_idx` exists for entries. `id` is already the primary key,
-- so the pair is unique for free.
create unique index clients_id_user_idx on clients (id, user_id);

create table expenses (
  -- Client-generated UUIDv7 on POST, so a retried insert is idempotent.
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    uuid not null,
  project_id   uuid,
  spent_on     date not null,
  -- Becomes the invoice line, so it is held to a charge's limits.
  description  text not null check (btrim(description) <> '' and char_length(description) <= 200),
  -- A reimbursement of nothing is not a line; a credit is a different feature.
  amount       numeric(12,2) not null check (amount > 0),
  -- A receipt or order number. Never printed on the invoice.
  note         text check (char_length(note) <= 500),
  -- Set means billed. The amount is in the client's currency: an expense is
  -- billed in its client's currency and never converted, so it has no
  -- currency of its own.
  invoice_id   uuid references invoices(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Same owner on both references, declared rather than checked in routes;
  -- `00000000000016_entry_project_same_owner.sql` has why. `on update
  -- restrict`, never cascade: a cascade would write `user_id` and hand the
  -- row to another account.
  constraint expense_client_same_owner
    foreign key (client_id, user_id) references clients (id, user_id)
    on update restrict,
  constraint expense_project_same_owner
    foreign key (project_id, user_id) references projects (id, user_id)
    on delete set null (project_id)
    on update restrict
);

-- The unbilled path: the Expenses tab and every invoice preview.
create index expenses_unbilled_idx on expenses (user_id, client_id, spent_on)
  where invoice_id is null;

create trigger t_expenses_touch before update on expenses
  for each row execute function touch_updated_at();

-- A project is optional, and when given it must be one of the expense's
-- client's projects: an expense filed under another client's project would
-- bill one client for work the invoice names as another's.
create or replace function check_expense_project() returns trigger
language plpgsql as $$
begin
  if new.project_id is not null and not exists (
    select 1 from projects where id = new.project_id and client_id = new.client_id
  ) then
    raise exception 'Project % does not belong to client %', new.project_id, new.client_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t_expenses_project_client
  before insert or update of project_id, client_id on expenses
  for each row execute function check_expense_project();

-- ── invoiced expenses are immutable ────────────────────────────────
-- The same lock `guard_billed_entry` holds on entries: once an expense is on
-- a non-draft invoice, what the client was asked to reimburse cannot change.
-- Detaching (void, or deleting a draft) stays allowed, because that is how an
-- invoice releases what it billed. The message matches `isBilledLock`.
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
     or new.project_id  is distinct from old.project_id then
    raise exception 'Expense % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger t_expenses_guard_billed before update on expenses
  for each row execute function guard_billed_expense();

create or replace function guard_billed_expense_delete() returns trigger
language plpgsql as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then return old; end if;
  select status into inv_status from invoices where id = old.invoice_id;
  if inv_status is not null and inv_status <> 'draft' then
    raise exception 'Expense % is billed on a % invoice and cannot be deleted', old.id, inv_status
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger t_expenses_guard_billed_delete before delete on expenses
  for each row execute function guard_billed_expense_delete();

alter table expenses enable row level security;
create policy own_expenses on expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on expenses to authenticated;
revoke all on expenses from anon;

-- ── expense lines ──────────────────────────────────────────────────
-- A third unit beside 'hour' and 'fixed'. Like a fixed charge it is one of
-- something, so its quantity and price cells stay blank on the document; it
-- also carries the date the cost was paid, which no other line has.
alter table invoice_line_items
  drop constraint invoice_line_items_unit_check,
  add constraint invoice_line_items_unit_check
    check (unit in ('hour', 'fixed', 'expense')),
  add column spent_on date,
  add constraint expense_line_is_one check (unit <> 'expense' or quantity = 1),
  add constraint expense_line_has_date
    check ((unit = 'expense') = (spent_on is not null));

-- ── the expenses subtotal ──────────────────────────────────────────
-- `subtotal` keeps its meaning — the services subtotal, and the base tax is
-- charged on — so every invoice already issued stays correct at 0 here.
-- `total = subtotal + tax_amount + expenses_subtotal`: tax never applies to a
-- reimbursement, and `total` stays the one figure awaiting and collected read.
alter table invoices
  add column expenses_subtotal numeric(12,2) not null default 0
    check (expenses_subtotal >= 0);

-- ── generation, in one transaction ─────────────────────────────────
-- `allocate_invoice_number` commits on its own when called through the API,
-- so any failure after it — and a race for an expense is one — left a number
-- with no invoice behind it. Here the number, the invoice, its frozen lines
-- and the claims on what it bills succeed or fail together.
--
-- It writes; it does not compute. `buildLineItems` prices everything, so the
-- preview and the invoice still come from the same code. `p_invoice` carries
-- the invoice's columns and its `lines`, in order.
--
-- The one thing it adds is the payment reference. Quoting the invoice number
-- is what makes a payment reconcilable, and the number does not exist until
-- this call allocates it, so `buildPaymentDetails` renders the block without
-- one and the reference is appended here — last, where it would have gone.
--
-- Entries keep their existing attach rule. An expense another invoice already
-- took raises, and the whole call rolls back — number included.
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
    notes, payment_terms, grouping_mode, payment_details
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
    v_details
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
