-- The setting is gone (#235): no invoice prints a notice line any more.
alter table user_settings drop column payment_notice;
