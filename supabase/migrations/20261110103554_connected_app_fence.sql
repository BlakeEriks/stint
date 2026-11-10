-- A connected app's token (#715) is an ordinary `authenticated` JWT that
-- also carries `client_id`, so it reaches the Data API like the user's own.
-- `requireSession` fences it from the routes; this fences it from
-- PostgREST: it reads clients, projects and entries, adds clients and
-- projects, edits a client, and renames a project or an entry's task,
-- nothing else.

-- Read from the claims PostgREST sets, not `auth.jwt()`, which the CI
-- databases' `auth` stub doesn't define.
create function connected_app() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ? 'client_id',
    false
  )
$$;

-- `service_role` too: the triggers below call it for whoever updates.
revoke all on function connected_app() from public, anon;
grant execute on function connected_app() to authenticated, service_role;

-- Restrictive, so each narrows the table's own-rows policy. Invoker
-- functions such as `create_invoice` write through these tables, so they
-- are refused too.
do $$
declare t text;
begin
  foreach t in array array[
    'user_settings', 'invoices', 'invoice_line_items', 'payment_profiles',
    'expenses', 'feedback', 'push_devices', 'subscriptions'
  ] loop
    execute format(
      'create policy no_connected_app on %I as restrictive to authenticated
         using (not (select connected_app())) with check (not (select connected_app()))', t);
  end loop;

  foreach t in array array['clients', 'projects', 'time_entries'] loop
    execute format(
      'create policy no_connected_app_delete on %I as restrictive
         for delete to authenticated using (not (select connected_app()))', t);
  end loop;
end $$;

create policy no_connected_app_insert on time_entries as restrictive
  for insert to authenticated with check (not (select connected_app()));

-- An app's update changes only the columns its trigger names. Named to fire
-- before the other update triggers, which set columns of their own; a
-- generated column is still null here, so it is left out.
create function connected_app_changes_only() returns trigger
language plpgsql
as $$
declare
  skip text[] := array(
    select attname from pg_attribute
    where attrelid = tg_relid and attgenerated <> ''
  ) || tg_argv;
begin
  if connected_app()
     and to_jsonb(new) - skip is distinct from to_jsonb(old) - skip then
    raise exception 'A connected app may change only %',
      array_to_string(tg_argv, ', ')
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger t_entries_app_changes before update on time_entries
  for each row execute function connected_app_changes_only('task_name');
create trigger t_projects_app_changes before update on projects
  for each row execute function connected_app_changes_only('name');
create trigger t_clients_app_changes before update on clients
  for each row execute function connected_app_changes_only(
    'name', 'email', 'address', 'hourly_rate', 'tax_rate', 'currency',
    'color', 'payment_profile_id', 'payment_terms_days', 'billing_period',
    'period_anchor'
  );

-- Definer, so the billed lock sees the invoice even when the caller's RLS
-- hides it, as it does from a connected app.
alter function guard_billed_entry()
  security definer set search_path = public, pg_temp;

-- `security definer`, so no policy above reaches it.
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or connected_app() then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  delete from public.invoices where user_id = uid;
  delete from auth.users where id = uid;
end $$;
