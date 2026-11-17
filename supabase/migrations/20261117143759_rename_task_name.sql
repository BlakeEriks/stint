-- #759: one request renames every entry carrying a task name.
--
-- In SQL because the match, `lower(task_name)`, is one PostgREST filters
-- cannot say, and one statement renames all or none.

create or replace function rename_task_name(
  p_user_id     uuid,
  p_from        text,
  p_to          text,
  p_project_id  uuid default null
)
returns table (
  renamed integer,
  -- Whether the running entry was among them, so its devices hear of it.
  running boolean
)
language sql
security invoker              -- runs as the caller, so RLS still applies
set search_path = public, pg_temp
as $$
  with changed as (
    update time_entries t
       set task_name = p_to
     where t.user_id = p_user_id
       -- Case-insensitive, as `recent_task_names` offers one spelling of each.
       and lower(t.task_name) = lower(p_from)
       -- An entry already named exactly `p_to` is neither written nor counted,
       -- so a retry changes nothing.
       and t.task_name is distinct from p_to
       and (p_project_id is null or t.project_id = p_project_id)
    returning t.ended_at
  )
  select count(*)::integer, coalesce(bool_or(ended_at is null), false)
  from changed;
$$;

revoke all on function rename_task_name(uuid, text, text, uuid) from public, anon;
grant execute on function rename_task_name(uuid, text, text, uuid) to authenticated;
