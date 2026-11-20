-- #838: each account's Settings business becomes its first business, the
-- default, so nothing an invoice prints changes until a second is added.
-- Any of the four fields set is a business to keep; one with no name is
-- named 'Your business', which Settings and New invoice's From block show
-- before an invoice prints it. An account with none has no business, and
-- New invoice asks for one as it asked for the name. Invoices keep a null
-- `business_profile_id`: they already carry the From block they were made
-- with. The Settings columns stay until the build that reads this table is
-- live; a later migration drops them.
insert into business_profiles (user_id, name, email, address, logo_url, is_default)
select s.user_id,
       coalesce(nullif(trim(s.business_name), ''), 'Your business'),
       nullif(trim(s.business_email), ''),
       nullif(trim(s.business_address), ''),
       nullif(trim(s.logo_url), ''),
       true
  from user_settings s
 where coalesce(nullif(trim(s.business_name), ''),
                nullif(trim(s.business_email), ''),
                nullif(trim(s.business_address), ''),
                nullif(trim(s.logo_url), '')) is not null
   and not exists (select 1 from business_profiles b where b.user_id = s.user_id);
