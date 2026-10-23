-- Payment terms are a number of days: the user's default, and a client's
-- own when it has one. The printed text is made from an invoice's dates.
alter table user_settings
  add column payment_terms_days int not null default 30
    check (payment_terms_days between 0 and 365),
  -- Old free text the backfill couldn't read; the inbox asks about it until
  -- the user saves their terms.
  add column legacy_payment_terms text;

alter table clients
  add column payment_terms_days int
    check (payment_terms_days between 0 and 365);
