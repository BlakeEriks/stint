-- The days the old free-text terms gave, by the rule that read them:
-- "Net N" or "N days" is N, "on receipt" with no count is 0. Null for text
-- it can't read or a count past the 365-day cap. Kept so a test can hold it
-- to that rule against real Postgres.
create function legacy_payment_terms_days(terms text) returns int
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when n is not null and n::int <= 365 then n::int
    when n is not null then null
    when lower(terms) like '%receipt%' then 0
  end
  from coalesce(
    substring(lower(terms) from 'net\s*(\d{1,4})(?!\d)'),
    substring(lower(terms) from '(?<!\d)(\d{1,4})\s*days')
  ) as n
$$;
revoke all on function legacy_payment_terms_days(text) from public, anon, authenticated;

update user_settings
set payment_terms_days = coalesce(legacy_payment_terms_days(default_payment_terms), 30),
    legacy_payment_terms = case
      when legacy_payment_terms_days(default_payment_terms) is null
        and btrim(default_payment_terms) <> '' then default_payment_terms
    end;
