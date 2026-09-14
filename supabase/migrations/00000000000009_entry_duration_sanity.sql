-- Entries of implausible length, surfaced in the inbox.
--
-- Two thresholds, because the two ends are different mistakes. An entry under
-- a minute was started and stopped without work between it; an entry over
-- eight hours is a timer left running overnight and billed as work. A
-- twenty-minute call is ordinary and must never be questioned, which is why
-- the short threshold is seconds rather than minutes.
--
-- Both nullable and NOT defaulted: null retires that side of the row, and a
-- default would switch a new inbox row on for every existing account without
-- being asked. The settings UI offers 60 and 8; the column offers nothing.
alter table user_settings
  add column min_entry_seconds integer
    check (min_entry_seconds is null or min_entry_seconds > 0),
  add column max_entry_hours   numeric(4,1)
    check (max_entry_hours is null or max_entry_hours > 0);

-- The user's answer to "is this length correct?", stored per entry.
--
-- Every other inbox row clears because its condition stops holding. This one
-- cannot: a nine-hour entry stays nine hours forever, so without a recorded
-- answer the row would return every day. `docs/design/screens/inbox.html`
-- carries the reasoning and the contrast with a snooze.
--
-- `not null default false` rather than nullable: unanswered and "not correct"
-- are the same state, and a third one would mean nothing.
alter table time_entries
  add column duration_ok boolean not null default false;

-- Changing an entry's times asks the question again.
--
-- An entry confirmed at 9h and later edited to 14h is a new question, and a
-- stale "yes" would silence it forever. In a trigger rather than the route
-- because the answer must not outlive the length it was given about, and
-- `/entries/:id` is not the only thing that can write these columns.
--
-- Named to sort AFTER t_entries_guard_billed: Postgres fires triggers in name
-- order, so the guard rejects a billed entry before this one touches it.
create or replace function reset_duration_ok() returns trigger
language plpgsql as $$
begin
  if new.started_at is distinct from old.started_at
     or new.ended_at is distinct from old.ended_at then
    new.duration_ok := false;
  end if;
  return new;
end $$;

create trigger t_entries_reset_duration_ok before update on time_entries
  for each row execute function reset_duration_ok();
