# Data model: rename a task name

No table changes. One function:

`rename_task_name(p_user_id uuid, p_from text, p_to text, p_project_id uuid default null)`
returns `(renamed integer, running boolean)`. `security invoker`, so RLS
contains it; `authenticated` may execute it.

It sets `task_name = p_to` on the caller's entries where
`lower(task_name) = lower(p_from)`, `task_name is distinct from p_to`, and
`project_id = p_project_id` when one is given. Billed entries rename
(`guard_billed_entry`, after #798); draft lines read names live.
