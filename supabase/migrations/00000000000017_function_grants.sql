-- Who may execute the two functions that predate the convention.
--
-- Every function from `00000000000010_one_rate_chain.sql` onward ends with
-- the same two lines — revoke from `public, anon`, then grant to
-- `authenticated`. These two were written before that and run on Postgres's
-- default, which is execute for PUBLIC. `anon` — a caller with no session —
-- holds execute on the one function that mutates `next_invoice_number`.
--
-- The protection that exists today is incidental, and that is the fault
-- rather than the exposure. `allocate_invoice_number` is `security invoker`,
-- so RLS on `user_settings` means its `update` matches no row for an
-- anonymous caller and it raises. True, and nothing in the migration says
-- so: the safety is a side effect of a policy written for another purpose,
-- and it would disappear the day the function is made `security definer` for
-- an unrelated reason. `00000000000004_api_grants.sql` grants tables
-- explicitly for exactly this reason.
--
-- The trigger functions in `00000000000002_integrity.sql` are deliberately
-- not here. Postgres does not consult execute privilege when firing a
-- trigger, and a direct call fails with "trigger functions can only be
-- called as triggers" whoever the caller is — so a grant on them would
-- assert a control that is not doing the work.

revoke all on function allocate_invoice_number(uuid) from public, anon;
grant execute on function allocate_invoice_number(uuid) to authenticated;

-- Redefined in `00000000000010_one_rate_chain.sql` to route through
-- `resolve_rate`. `create or replace` preserves an existing ACL, so the
-- grant is correct wherever it sits; it is here so both functions are in one
-- file rather than split across the migration that first declared each.
revoke all on function resolve_entry_rate(uuid) from public, anon;
grant execute on function resolve_entry_rate(uuid) to authenticated;
