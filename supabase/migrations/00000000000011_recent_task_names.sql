-- Recent task names, for suggesting one the user has typed before.
--
-- No existing index serves this: `entries_user_started_idx` gets recency but
-- not the name, and `entries_unbilled_idx` is partial on `invoice_id is null`,
-- which excludes the most-repeated work of all — the work already billed.
create index entries_task_name_idx
  on time_entries (user_id, project_id, started_at desc)
  include (task_name)
  where task_name <> '';

create or replace function recent_task_names(
  p_user_id     uuid,
  p_project_id  uuid default null,
  p_limit       integer default 8
)
returns table (
  task_name    text,
  project_id   uuid,
  last_used_at timestamptz
)
language sql
stable
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  -- One row per name, case-insensitively: "Standup" and "standup" are the same
  -- work, and offering both is offering the user their own typo.
  select task_name, project_id, last_used_at from (
    select distinct on (lower(t.task_name))
           t.task_name, t.project_id, t.started_at as last_used_at
    from time_entries t
    where t.user_id = p_user_id and t.task_name <> ''
    order by lower(t.task_name),
             coalesce(t.project_id = p_project_id, false) desc,
             t.started_at desc
  ) d
  -- `coalesce` is load-bearing: a bare comparison is NULL for an entry with no
  -- project, and NULLs sort FIRST under DESC, so internal work would outrank
  -- the selected project's own names.
  order by coalesce(d.project_id = p_project_id, false) desc,
           d.last_used_at desc
  limit p_limit;
$$;

revoke all on function recent_task_names(uuid, uuid, integer) from public, anon;
grant execute on function recent_task_names(uuid, uuid, integer) to authenticated;
