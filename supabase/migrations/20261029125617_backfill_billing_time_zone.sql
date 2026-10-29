-- An existing account bills in the zone of its newest invoice, so its next
-- invoice reads the same calendar as its last. An account with no invoice
-- stays unset until it picks one.
update user_settings s
set billing_time_zone = (
  select i.tz from invoices i
  where i.user_id = s.user_id and i.tz is not null
  order by i.sequence_no desc
  limit 1
)
where s.billing_time_zone is null;
