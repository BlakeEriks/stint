-- ═══════════════════════════════════════════════════════════════════
-- Integrity rules that the API must not be able to violate, plus RLS.
-- ═══════════════════════════════════════════════════════════════════

-- ── updated_at maintenance ─────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger t_user_settings_touch before update on user_settings
  for each row execute function touch_updated_at();
create trigger t_clients_touch before update on clients
  for each row execute function touch_updated_at();
create trigger t_projects_touch before update on projects
  for each row execute function touch_updated_at();
create trigger t_invoices_touch before update on invoices
  for each row execute function touch_updated_at();
create trigger t_entries_touch before update on time_entries
  for each row execute function touch_updated_at();

-- ── billed entries are immutable ───────────────────────────────────
-- Once an entry is attached to a non-draft invoice, its billing-relevant
-- fields are frozen. Detaching it (invoice voided) stays allowed.
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
     -- task_name becomes the invoice line description: editing it after
     -- issue changes what the client was told they were billed for.
     or new.task_name is distinct from old.task_name then
    raise exception 'Entry % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger t_entries_guard_billed before update on time_entries
  for each row execute function guard_billed_entry();

create or replace function guard_billed_entry_delete() returns trigger
language plpgsql as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then return old; end if;
  select status into inv_status from invoices where id = old.invoice_id;
  if inv_status is not null and inv_status <> 'draft' then
    raise exception 'Entry % is billed on a % invoice and cannot be deleted', old.id, inv_status
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger t_entries_guard_billed_delete before delete on time_entries
  for each row execute function guard_billed_entry_delete();

-- ── gapless invoice numbering ──────────────────────────────────────
-- Allocates the next sequence atomically. The row lock serializes
-- concurrent callers, so numbers are gapless even under parallel requests.
create or replace function allocate_invoice_number(p_user_id uuid)
returns table (sequence_no integer, invoice_number text)
language plpgsql as $$
declare
  v_seq    integer;
  v_prefix text;
begin
  update user_settings
     set next_invoice_number = next_invoice_number + 1
   where user_id = p_user_id
  returning next_invoice_number - 1, invoice_number_prefix
       into v_seq, v_prefix;

  if v_seq is null then
    raise exception 'No settings row for user %', p_user_id;
  end if;

  sequence_no    := v_seq;
  invoice_number := v_prefix || lpad(v_seq::text, 4, '0');
  return next;
end $$;

-- ── rate resolution ────────────────────────────────────────────────
-- entry override -> project -> client -> user default.
create or replace function resolve_entry_rate(p_entry_id uuid)
returns numeric
language sql stable as $$
  select coalesce(
    e.rate_override,
    p.hourly_rate,
    c.hourly_rate,
    s.default_hourly_rate
  )
  from time_entries e
  left join projects      p on p.id = e.project_id
  left join clients       c on c.id = p.client_id
  left join user_settings s on s.user_id = e.user_id
  where e.id = p_entry_id
$$;

-- ── row level security ─────────────────────────────────────────────
-- The API is the intended path; RLS is the safety net beneath it.
alter table user_settings      enable row level security;
alter table clients            enable row level security;
alter table projects           enable row level security;
alter table invoices           enable row level security;
alter table time_entries       enable row level security;
alter table invoice_line_items enable row level security;

create policy own_settings on user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_clients on clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_projects on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_invoices on invoices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_entries on time_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Line items inherit access from their invoice.
create policy own_line_items on invoice_line_items
  for all using (
    exists (select 1 from invoices i where i.id = invoice_id and i.user_id = auth.uid())
  ) with check (
    exists (select 1 from invoices i where i.id = invoice_id and i.user_id = auth.uid())
  );

-- ── settings bootstrap ─────────────────────────────────────────────
-- SECURITY DEFINER runs as the owner, but the table NAME still resolves with
-- the caller's search_path — and the caller is `supabase_auth_admin`, whose
-- path excludes `public`. Without the pinned path the insert fails, the whole
-- signup transaction rolls back, and the client sees only "Database error
-- saving new user". Pinning also stops a caller shadowing `user_settings`.
create or replace function create_default_settings() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger t_new_user_settings after insert on auth.users
  for each row execute function create_default_settings();
