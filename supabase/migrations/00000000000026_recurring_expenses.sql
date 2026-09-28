-- Recurring expenses: a cost the client reimburses every month, set up once.
--
-- A recurrence is a rule, not a bill. Each month it produces one ordinary
-- expense, which waits, bills and locks exactly as a hand-recorded one does,
-- and can be edited or deleted on its own without touching the rule.

create table recurring_expenses (
  -- Client-generated UUIDv7 on POST, so a retried insert is idempotent.
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  client_id         uuid not null,
  project_id        uuid,
  description       text not null check (btrim(description) <> '' and char_length(description) <= 200),
  amount            numeric(12,2) not null check (amount > 0),
  note              text check (char_length(note) <= 500),
  -- The first charge, and the day of the month every later one falls on.
  starts_on         date not null,
  -- Set means stopped. Nothing dated after it is produced.
  stopped_on        date,
  -- The first of the last month produced: what has been produced is decided
  -- here, not by which expenses still exist, so a month the user deleted is
  -- not produced again.
  produced_through  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint recurring_client_same_owner
    foreign key (client_id, user_id) references clients (id, user_id)
    on update restrict,
  constraint recurring_project_same_owner
    foreign key (project_id, user_id) references projects (id, user_id)
    on delete set null (project_id)
    on update restrict
);

create trigger t_recurring_expenses_touch before update on recurring_expenses
  for each row execute function touch_updated_at();

-- The same rule as an expense's: a project, when given, is its client's.
create trigger t_recurring_expenses_project_client
  before insert or update of project_id, client_id on recurring_expenses
  for each row execute function check_expense_project();

alter table recurring_expenses enable row level security;
create policy own_recurring_expenses on recurring_expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on recurring_expenses to authenticated;
revoke all on recurring_expenses from anon;

-- ── what a recurrence produced ─────────────────────────────────────
-- An expense remembers the rule and the month it came from. `restrict`: a
-- recurrence is stopped, never deleted, because its expenses point at it.
alter table expenses
  add column recurring_expense_id uuid references recurring_expenses(id) on delete restrict,
  add column recurrence_month date,
  add constraint recurrence_pairs
    check ((recurring_expense_id is null) = (recurrence_month is null)),
  -- One per month, whatever else goes wrong: the backstop under the lock.
  add constraint one_expense_per_recurrence_month
    unique (recurring_expense_id, recurrence_month);

-- ── producing ──────────────────────────────────────────────────────
-- Produces every month's expense that is due and not yet produced, through
-- `p_through` — today, in the caller's zone. Called before anything reads
-- expenses: the Expenses tab, an invoice preview, generation. Nothing needs
-- a produced row sooner, so no scheduled job exists to keep in step.
--
-- A month's expense falls on `starts_on`'s day, or on the month's last day
-- when that day does not exist: a recurrence from 31 January charges 28
-- February. A month whose day has not come yet is left for a later call.
--
-- `for update` serializes two callers producing for one recurrence; the
-- unique constraint is the backstop if anything ever skipped the lock.
create or replace function produce_recurring_expenses(p_user_id uuid, p_through date)
returns void
language plpgsql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
declare
  r        recurring_expenses;
  v_limit  date;
  v_month  date;
  v_day    date;
begin
  for r in
    select * from recurring_expenses where user_id = p_user_id for update
  loop
    v_limit := least(p_through, coalesce(r.stopped_on, p_through));
    v_month := coalesce(
      (r.produced_through + interval '1 month')::date,
      date_trunc('month', r.starts_on)::date
    );

    while v_month <= v_limit loop
      v_day := least(
        v_month + (extract(day from r.starts_on)::integer - 1),
        (v_month + interval '1 month' - interval '1 day')::date
      );
      exit when v_day > v_limit;

      insert into expenses (
        user_id, client_id, project_id, spent_on, description, amount, note,
        recurring_expense_id, recurrence_month
      ) values (
        r.user_id, r.client_id, r.project_id, v_day, r.description, r.amount,
        r.note, r.id, v_month
      )
      on conflict (recurring_expense_id, recurrence_month) do nothing;

      update recurring_expenses set produced_through = v_month where id = r.id;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;
end $$;

revoke all on function produce_recurring_expenses(uuid, date) from public, anon;
grant execute on function produce_recurring_expenses(uuid, date) to authenticated;
