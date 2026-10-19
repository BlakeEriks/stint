-- #301: a US contractor gives a client their TIN on a W-9, not on an invoice,
-- and an SSN printed there travelled with every PDF the client forwarded.
alter table user_settings drop column tax_id;
