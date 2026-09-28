-- A project has no color: color identifies a client, and nothing has read or
-- written `projects.color` since that became true.
alter table projects drop column if exists color;
