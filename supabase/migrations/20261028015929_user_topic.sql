-- Each signed-in browser joins one private Realtime topic, `user:<id>`, where
-- the server broadcasts that the running timer changed (#517). Realtime lets
-- a client join a private topic only if this select policy shows it a row, so
-- a user joins their own and no one else's. No insert policy: only the
-- server, with the secret key, broadcasts. Realtime owns the table and turns
-- its RLS on, so this adds a policy and nothing else.

create policy join_own_user_topic on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'user:' || (select auth.uid())::text);
