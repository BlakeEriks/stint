-- #478: work billed elsewhere is never on an invoice too. Checked here rather
-- than by the writers, which read and then write: a mark landing between an
-- invoice's read of unbilled work and its attach would otherwise leave an
-- entry billed twice. `dbCode` maps the name to ENTRY_ALREADY_INVOICED.
-- No row breaks it: before #478 only an import set the flag, on new rows,
-- and every attach skips flagged entries.
alter table time_entries
  add constraint entry_billed_once
  check (invoice_id is null or not invoiced_elsewhere);
