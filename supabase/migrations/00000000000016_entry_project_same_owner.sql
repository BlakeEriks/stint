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
-- `on update cascade` because the pair is what is referenced: a project
-- handed to another user must carry its entries or orphan them, and there is
-- no such operation in this product. It is here so the constraint is
-- complete rather than because anything performs it.
alter table time_entries
  add constraint entry_project_same_owner
  foreign key (project_id, user_id) references projects (id, user_id)
  on delete set null (project_id)
  on update cascade;

-- The single-column FK is now implied: same `on delete set null`, narrower
-- predicate. Keeping it would check the same reference twice on every write
-- and give one violation two names.
alter table time_entries drop constraint time_entries_project_id_fkey;
