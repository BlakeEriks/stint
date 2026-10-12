-- The paid tier (#60): a mirror of each user's Stripe subscription.
--
-- Stripe is the source of truth. The server writes this row from Stripe's
-- current record (`syncCustomer()` in apps/web/src/lib/billing.ts), from the
-- webhook and after Checkout returns, so it holds no state of its own.
--
-- Written only as `service_role`: the webhook has no user session. A user
-- may read their own row and nothing else; they hold no write grant, so no
-- client can make itself paid. Whether a status counts as paid is
-- `planOf()` in packages/core, not SQL.
--
-- The row goes with the account (`on delete cascade`); DELETE /account
-- cancels the Stripe subscription before it gets here.

create table subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text not null,
  status                 text not null check (status in (
    'active', 'trialing', 'past_due', 'unpaid',
    'incomplete', 'incomplete_expired', 'canceled', 'paused'
  )),
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table subscriptions enable row level security;
create policy select_own_subscription on subscriptions
  for select using (user_id = auth.uid());

grant select on subscriptions to authenticated;
grant select, insert, update on subscriptions to service_role;
revoke all on subscriptions from anon;
