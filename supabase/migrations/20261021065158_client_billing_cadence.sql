-- #334: how often the client's contract bills it. The new invoice screen
-- defaults its period from it and warns when a period doesn't match.
alter table clients
  add column billing_cadence text not null default 'monthly'
  constraint clients_billing_cadence check (billing_cadence in ('monthly', 'semi-monthly'));
