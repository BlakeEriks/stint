-- A payment profile's notes printed under the payment block, beside the
-- invoice's own notes, so two fields did one job. The invoice's stay.
alter table payment_profiles drop column notes;
