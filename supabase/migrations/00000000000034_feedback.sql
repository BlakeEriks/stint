-- Feedback a user sends from inside the app (#205).
--
-- Blake reads it in the Supabase dashboard, with a saved query that joins
-- `auth.users` for the sender's email. That join stays in the dashboard: a
-- view over `auth.users` in `public` would be served by PostgREST and could
-- hand one user another's address.
--
-- A message is written once. Only select and insert are granted, so an
-- update or a delete fails on the grant before RLS is consulted, even for
-- the sender. Select-own is there so a retried POST can find the row it
-- already wrote. The row goes with the account (`on delete cascade`): it is
-- the user's own words.

create table feedback (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 2000),
  screen      text not null check (char_length(screen) between 1 and 200),
  client      text not null check (client in ('web', 'macos')),
  app_version text not null check (char_length(app_version) between 1 and 64),
  created_at  timestamptz not null default now()
);

create index feedback_created_at_idx on feedback (created_at desc);

alter table feedback enable row level security;
create policy insert_own_feedback on feedback
  for insert with check (user_id = auth.uid());
create policy select_own_feedback on feedback
  for select using (user_id = auth.uid());

grant select, insert on feedback to authenticated;
revoke all on feedback from anon;
