-- The invoice document is the paid tier (#61), and canceling never locks an
-- invoice generated while paying (#60). `subscriptions` holds only Stripe's
-- current record, so the plan at generation is stamped on the invoice here.
--
-- Copied by trigger, never taken from the caller: `create_invoice` runs as
-- the caller and `authenticated` may insert and update invoices through
-- PostgREST, so a value they pass could claim a plan they never had. The
-- status is copied as is; whether it counts as paid is `planOf()` in
-- packages/core, not SQL. Existing invoices keep null: nobody had paid.

alter table invoices add column issued_subscription_status text check (
  issued_subscription_status in (
    'active', 'trialing', 'past_due', 'unpaid',
    'incomplete', 'incomplete_expired', 'canceled', 'paused'
  )
);

create function stamp_issued_subscription_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.issued_subscription_status := (
      select status from subscriptions where user_id = new.user_id
    );
  elsif new.issued_subscription_status is distinct from old.issued_subscription_status then
    raise exception 'Invoice % keeps the plan it was generated on', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger t_invoices_issued_subscription_status
  before insert or update on invoices
  for each row execute function stamp_issued_subscription_status();
