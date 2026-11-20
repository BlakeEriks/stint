-- #838: an invoice comes from one of the user's businesses, chosen on New
-- invoice, rather than from the one set of fields on `user_settings`.
-- Shaped and managed as `payment_profiles` is: archived, never deleted, one
-- live default per user, the same routes (`apps/web/src/lib/profiles.ts`).

create table business_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  -- Null only on a row the backfill made from Settings without one. The
  -- API requires it, and an invoice refuses a business without it.
  email       text,
  address     text,
  logo_url    text,
  is_default  boolean not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- The target of the invoice's same-owner key.
  unique (id, user_id)
);

create unique index one_default_business_profile_per_user
  on business_profiles (user_id)
  where is_default and archived_at is null;

create trigger t_business_profiles_touch before update on business_profiles
  for each row execute function touch_updated_at();

alter table business_profiles enable row level security;
create policy own_business_profiles on business_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- As `payment_profiles`: no connected app reads or writes it.
create policy no_connected_app on business_profiles as restrictive to authenticated
  using (not (select connected_app())) with check (not (select connected_app()));

grant select, insert, update, delete on business_profiles to authenticated;
revoke all on business_profiles from anon;

-- Composite, so an invoice can only name its own user's business. No
-- delete action: a business is archived, never deleted, and `delete_account`
-- removes invoices before the user.
alter table invoices
  add column business_profile_id uuid,
  add constraint invoice_business_same_owner
    foreign key (business_profile_id, user_id)
    references business_profiles (id, user_id);

-- The From block is copied from the invoice's business, as it was from
-- Settings (`20261019090015_invoice_parties.sql`).
create or replace function stamp_invoice_parties() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  select b.name, b.address, b.email, b.logo_url
    into new.business_name, new.business_address, new.business_email, new.logo_url
    from business_profiles b
   where b.id = new.business_profile_id;

  select c.name, c.email, c.address
    into new.client_name, new.client_email, new.client_address
    from clients c
   where c.id = new.client_id;

  return new;
end $$;

-- As `20261110150708_summary_texts.sql` has it, writing the business.
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
    user_id, client_id, business_profile_id, invoice_number, sequence_no, status,
    due_date, period_start, period_end,
    currency, notes, payment_terms, grouping_mode, payment_details,
    summary_text, summary_texts, reference, supporting_detail,
    tz, excluded_expense_ids
  ) values (
    p_user_id,
    (p_invoice->>'client_id')::uuid,
    (p_invoice->>'business_profile_id')::uuid,
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
