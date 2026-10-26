-- Read into payment_terms_days by the backfill before this.
alter table user_settings drop column default_payment_terms;
