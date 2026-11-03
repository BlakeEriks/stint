-- Expenses no longer have a note; existing ones are dropped (#623).
alter table expenses drop column note;
