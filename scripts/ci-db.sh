#!/usr/bin/env bash
# Build a database CI can run a suite against.
#
#   ci-db.sh tt          route tests: RLS OFF, so the handlers see every row
#   ci-db.sh tt_rls --rls  RLS ON, reached as a non-superuser `authenticated`
#
# Migrations go through `pnpm migrate --url`, so the real migration script —
# schema_migrations, one transaction per file — is what CI exercises.
#
# PGPORT defaults to CI's own 5432. A local Supabase stack listens on 54322,
# so `PGPORT=54322 ci-db.sh tt` is how a developer reaches the same databases
# the CI job builds.
set -euo pipefail

DB=$1
RLS=${2:-}
PORT=${PGPORT:-5432}
PSQL="psql -h localhost -p $PORT -U postgres -v ON_ERROR_STOP=1"
export PGPASSWORD=postgres

$PSQL -c "create database $DB" 2>/dev/null || true

# Supabase ships `auth` and the two roles; the grants migration needs them.
# Roles are CLUSTER-wide, so only the first database to run this creates them.
$PSQL -d "$DB" <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
SQL

# `authenticated` mirrors the role PostgREST uses for a signed-in caller, so
# it logs in here — NOT a superuser and NOT BYPASSRLS, or every RLS assertion
# passes vacuously.
#
# On a Supabase stack `authenticated` is reserved and owned by supabase_admin,
# so the stub `postgres` superuser CI creates cannot alter it. Connect as the
# owner where that role exists; CI has only `postgres` and uses it.
if [ "$RLS" = "--rls" ]; then
  OWNER=postgres
  if $PSQL -d "$DB" -tAc \
      "select 1 from pg_roles where rolname = 'supabase_admin'" | grep -q 1; then
    OWNER=supabase_admin
  fi
  psql -h localhost -p "$PORT" -U "$OWNER" -d "$DB" -v ON_ERROR_STOP=1 \
    -c "alter role authenticated login password 'test'"
fi

pnpm migrate --url "postgresql://postgres:postgres@localhost:$PORT/$DB"

if [ "$RLS" = "--rls" ]; then
  # Table privileges come from the grants migration, not from here: granting
  # them ad-hoc would hide a broken grants migration.
  $PSQL -d "$DB" <<'SQL'
grant usage on schema public, auth to authenticated;
grant select on auth.users to authenticated;
grant execute on all functions in schema public, auth to authenticated;
SQL
else
  $PSQL -d "$DB" -c "
    alter table user_settings disable row level security;
    alter table clients disable row level security;
    alter table projects disable row level security;
    alter table invoices disable row level security;
    alter table time_entries disable row level security;
    alter table invoice_line_items disable row level security;
    alter table payment_profiles disable row level security;"
fi
