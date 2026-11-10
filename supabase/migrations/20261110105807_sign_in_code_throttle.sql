-- A throttle on `/api/v1/auth/code`, per client IP. That route asks GoTrue
-- with the secret key, past the CAPTCHA, so GoTrue's own per-IP limit counts
-- only the server's address, which every caller shares.
--
-- The table is in `private`, a schema PostgREST does not serve, and no role
-- but its owner is granted it; RLS is on with no policy, so a grant added by
-- mistake still shows nothing. Only `take_sign_in_code_slot` reaches it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.sign_in_code_requests (
  ip text not null,
  requested_at timestamptz not null default now()
);
create index sign_in_code_requests_by_ip
  on private.sign_in_code_requests (ip, requested_at);
alter table private.sign_in_code_requests enable row level security;

-- Whether `p_ip` may ask for another code: five an hour. A granted slot is
-- counted at once. An IPv6 address counts as its /64, which one client
-- holds whole and can rotate through. The advisory lock keeps two requests from one address
-- from both reading four.
create function public.take_sign_in_code_slot(p_ip text)
returns table (allowed boolean)
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_ip like '%:%' then
    p_ip := network(set_masklen(p_ip::inet, 64))::text;
  end if;
  perform pg_advisory_xact_lock(hashtext('sign_in_code:' || p_ip));
  delete from private.sign_in_code_requests
    where requested_at < now() - interval '1 hour';
  if (select count(*) from private.sign_in_code_requests where ip = p_ip) >= 5
  then
    return query select false;
    return;
  end if;
  insert into private.sign_in_code_requests (ip) values (p_ip);
  return query select true;
end;
$$;

revoke all on function public.take_sign_in_code_slot(text)
  from public, anon, authenticated;
grant execute on function public.take_sign_in_code_slot(text) to service_role;
