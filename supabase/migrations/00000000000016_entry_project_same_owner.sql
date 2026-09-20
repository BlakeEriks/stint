-- An entry may only reference a project belonging to the same user.
--
-- Without this, `POST /timer/start` with another account's `project_id`
-- returned 201 and stored the reference. RLS hid the consequence rather than
-- preventing it: every read is scoped, so the entry rendered with no project
-- name while the row stayed wrong in the database.
--
-- The check belongs here and not in the routes. `/timer/start`, `PATCH
-- /timer` and `PATCH /entries/:id` all write the column, so a route-level
-- check is three copies of one rule and a fourth route forgets it. It would
-- also be a race: the project's owner can change between the check and the
-- insert, and only a constraint evaluated with the write is safe against
-- that.
--
-- A composite foreign key states it declaratively, so the planner enforces it
-- on writes nobody has written yet. It needs a unique key on the referenced
-- side to point at, which is what `projects_id_user_idx` exists for — `id` is
-- already the primary key, so the pair is unique for free and the index is
-- redundant for lookups. It is here because the FK requires it.
create unique index projects_id_user_idx on projects (id, user_id);

-- Pre-existing violations would make the constraint unaddable. There should
-- be none outside a database where the hole above was exercised, so this
-- clears the reference rather than the entry: the time is the user's record
-- and is still theirs, it just cannot claim someone else's project.
update time_entries e
   set project_id = null
  from projects p
 where p.id = e.project_id
   and p.user_id <> e.user_id;

-- `on delete set null (project_id)` names the column, which is the whole
-- reason this works: a bare `set null` nulls every column in the key, and
-- `user_id` is `not null`, so deleting a project would fail on its own
-- entries. Postgres 15+.
--
-- `on update restrict`, NOT cascade. `user_id` is half the referenced key, so
-- a cascade would not fix up a reference — it would WRITE `time_entries.user_id`
-- and hand another user's time records to a different account in one statement.
-- It also walks past `guard_billed_entry`, which enumerates the columns an
-- issued invoice freezes and does not list `user_id`, because until this
-- constraint existed nothing could change it: an entry billed on a sent
-- invoice ends up owned by someone other than the invoice.
--
-- Nothing in this product hands a project to another user. That is the reason
-- the operation must FAIL rather than succeed quietly — an absent writer is
-- not a guarantee, and `CLAUDE.md`'s "never silently modifies user data"
-- binds the database as much as the app.
alter table time_entries
  add constraint entry_project_same_owner
  foreign key (project_id, user_id) references projects (id, user_id)
  on delete set null (project_id)
  on update restrict;

-- The single-column FK is now implied: same `on delete set null`, narrower
-- predicate. Keeping it would check the same reference twice on every write
-- and give one violation two names.
alter table time_entries drop constraint time_entries_project_id_fkey;

-- `guard_billed_entry` froze every column an issued invoice depends on except
-- the one nothing could write. The constraint above closes the path that
-- exposed it, so this is the second lock rather than the fix: the guarantee
-- should hold because the trigger says so, not because no writer exists.
create or replace function guard_billed_entry() returns trigger
language plpgsql as $$
declare
  inv_status text;
begin
  if old.invoice_id is null then
    return new;
  end if;

  select status into inv_status from invoices where id = old.invoice_id;

  if inv_status is null or inv_status = 'draft' then
    return new;
  end if;

  -- Allow only detachment from the invoice (void/unbill path).
  if new.invoice_id is distinct from old.invoice_id and new.invoice_id is null then
    return new;
  end if;

  if new.started_at    is distinct from old.started_at
     or new.ended_at   is distinct from old.ended_at
     or new.is_billable is distinct from old.is_billable
     or new.rate_override is distinct from old.rate_override
     or new.project_id is distinct from old.project_id
     -- An entry billed on someone's invoice must stay theirs.
     or new.user_id    is distinct from old.user_id
     -- task_name becomes the invoice line description: editing it after
     -- issue changes what the client was told they were billed for.
     or new.task_name is distinct from old.task_name then
    raise exception 'Entry % is billed on a % invoice and cannot be modified', old.id, inv_status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;
