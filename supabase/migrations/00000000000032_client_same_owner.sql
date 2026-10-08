-- An invoice or a project may only reference a client of the same user.
--
-- A foreign-key check does not consult RLS, so a single-column key let a
-- user write a row against another account's client. The same hole
-- `00000000000016_entry_project_same_owner.sql` closed for entries, and it
-- has why the rule is a constraint and not a route check. `on update
-- restrict`, never cascade: a cascade would write `user_id` and hand the row
-- to another account. `clients_id_user_idx` (`00000000000025_expenses.sql`)
-- is the unique key both point at.

alter table invoices
  add constraint invoice_client_same_owner
  foreign key (client_id, user_id) references clients (id, user_id)
  on delete restrict
  on update restrict;

alter table invoices drop constraint invoices_client_id_fkey;

-- `set null (client_id)` names the column: a bare `set null` would null
-- `user_id` too, which is `not null`.
alter table projects
  add constraint project_client_same_owner
  foreign key (client_id, user_id) references clients (id, user_id)
  on delete set null (client_id)
  on update restrict;

alter table projects drop constraint projects_client_id_fkey;
