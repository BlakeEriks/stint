-- #838: each account's Settings business becomes its first business, the
-- default, so nothing an invoice prints changes until a second is added. An
-- account with no business name has none, and New invoice asks for one as
-- it asked for the name. Invoices keep a null `business_profile_id`: they
-- already carry the From block they were made with.
insert into business_profiles (user_id, name, email, address, logo_url, is_default)
select user_id,
       trim(business_name),
       nullif(trim(business_email), ''),
       nullif(trim(business_address), ''),
       logo_url,
       true
  from user_settings
 where nullif(trim(business_name), '') is not null;
