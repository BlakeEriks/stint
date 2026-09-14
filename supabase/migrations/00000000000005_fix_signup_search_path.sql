-- Pin search_path on the signup trigger, for databases where
-- 00000000000002 ran before it carried the pinned path.

create or replace function create_default_settings() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;
