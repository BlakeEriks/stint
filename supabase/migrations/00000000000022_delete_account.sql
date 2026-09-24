-- Deletes the caller's account and everything it owns, in one transaction.
--
-- Every table cascades from `auth.users` except where an issued invoice
-- guards a row: `invoices.client_id` is `on delete restrict`, and
-- `guard_billed_entry_delete` refuses to delete an entry billed on a sent or
-- paid invoice. So invoices go first. Their line items cascade, their
-- entries detach (the one change the billed-entry guard allows), and the
-- user row then takes the rest.
--
-- `security definer` because `authenticated` cannot touch `auth.users`. The
-- id comes from `auth.uid()`, never an argument, so a caller can only ever
-- delete themselves. The search path is pinned rather than empty because the
-- triggers these deletes fire name `invoices` unqualified.
create function delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  delete from public.invoices where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function delete_account() from public, anon;
grant execute on function delete_account() to authenticated;
