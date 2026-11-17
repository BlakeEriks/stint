-- Payment details lost Notes in #635, and the build before it is gone, so
-- nothing selects the column any more.
alter table payment_profiles drop column notes;
