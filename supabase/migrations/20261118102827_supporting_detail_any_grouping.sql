-- Page 2 attaches to any grouping now (#800). Which table a grouping may
-- attach is `offeredSchedules` in `@stint/core`, checked by `CreateInvoice`.
alter table invoices
  drop constraint invoices_supporting_detail_with_summary;
