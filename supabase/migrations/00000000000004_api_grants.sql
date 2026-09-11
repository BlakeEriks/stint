-- ═══════════════════════════════════════════════════════════════════
-- API grants.
--
-- PostgREST connects as `anon` (no session) or `authenticated` (a signed-in
-- user). Neither can touch a table without a grant, REGARDLESS of RLS — the
-- grant is checked first, and a missing one fails with 42501 before any
-- policy runs.
--
-- Supabase's "Automatically expose new tables" setting normally issues these
-- for you. It should be OFF: a table holding bank details must not become
-- world-reachable the moment it is created. That makes granting explicit,
-- which is this file.
--
-- Two layers, and both are load-bearing:
--   GRANT decides whether the role may touch the table at all.
--   RLS   decides which rows it sees once it may.
-- Granting broadly here is safe ONLY because every table has RLS enabled
-- with a policy scoping rows to auth.uid(). `pnpm verify:schema` asserts
-- exactly that, and is the real control.
-- ═══════════════════════════════════════════════════════════════════

-- `authenticated` is every signed-in user. RLS narrows this to their own rows.
grant select, insert, update, delete on
  user_settings, clients, projects, time_entries,
  invoices, invoice_line_items, payment_profiles
to authenticated;

-- `anon` is a caller with no session. It is granted NOTHING: every table in
-- this app is per-user, so there is no such thing as public data here. The
-- signed-out surface is the magic-link form, which needs no table access.
revoke all on
  user_settings, clients, projects, time_entries,
  invoices, invoice_line_items, payment_profiles
from anon;

-- Migration bookkeeping is not application data. Guarded because this table
-- is created by `pnpm migrate`, and the CI databases apply these files with
-- raw psql instead — where it legitimately does not exist.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    execute 'revoke all on schema_migrations from anon, authenticated';
  end if;
end $$;

-- Sequences: none of these tables use serial/identity columns (ids are uuid,
-- and invoice numbering is allocated by a locked row in user_settings), so
-- there is deliberately nothing to grant here.
