-- ═══════════════════════════════════════════════════════════════════
-- Pin search_path on the signup trigger.
--
-- `create_default_settings` is SECURITY DEFINER, so it executes with the
-- owner's privileges — but name resolution still uses the CALLER's
-- search_path. Supabase's Auth service inserts into auth.users as
-- `supabase_auth_admin`, whose search_path does not include `public`, so
-- `user_settings` did not resolve and the insert failed.
--
-- The trigger runs inside the signup transaction, so that failure rolled the
-- whole thing back: no user was created and the client saw a bare
-- "Database error saving new user" with a 500.
--
-- 00000000000002 is corrected too, so a fresh database never has this bug;
-- this file exists for databases where it already ran.
-- ═══════════════════════════════════════════════════════════════════

create or replace function create_default_settings() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;
