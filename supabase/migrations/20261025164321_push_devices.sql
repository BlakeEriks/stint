-- The phones the server tells when the running timer changes (#463).
--
-- One row per account and token: registering again is a no-op, and a phone
-- that changed accounts without reaching the server on sign-out sits under
-- both. That leaks nothing, since a push says only that the timer changed
-- and the phone asks the server with its own session. A new token from the
-- provider is a new row, so there is no update grant; the old one is
-- deleted when the provider calls it unregistered. Android only until #471
-- adds `ios`.

create table push_devices (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null check (char_length(token) between 1 and 4096),
  platform   text not null check (platform in ('android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table push_devices enable row level security;
create policy select_own_push_device on push_devices
  for select using (user_id = auth.uid());
create policy insert_own_push_device on push_devices
  for insert with check (user_id = auth.uid());
create policy delete_own_push_device on push_devices
  for delete using (user_id = auth.uid());

grant select, insert, delete on push_devices to authenticated;
revoke all on push_devices from anon;
