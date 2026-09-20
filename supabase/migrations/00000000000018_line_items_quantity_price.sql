-- A line item becomes `quantity x unit_price`, whatever it charges for.
--
-- `00000000000001_schema.sql` now declares the new shape, which is correct
-- for a database built from scratch and invisible to one already migrated:
-- `pnpm migrate` records applied files by name, so an edited migration is
-- never re-run. This file is what carries the same change to a database
-- that has already seen the old one.
--
-- Written as a drop and re-add rather than a rename plus backfill because
-- `invoice_line_items` held no rows anywhere it had shipped. Keep that in
-- mind before copying this shape: once a real invoice exists, its lines are
-- a legal record and the columns have to be migrated, not replaced.
alter table invoice_line_items
  drop column if exists quantity_seconds,
  drop column if exists resolved_rate;

alter table invoice_line_items
  add column if not exists unit text not null default 'hour',
  add column if not exists quantity numeric(12,2) not null default 0,
  add column if not exists unit_price numeric(12,2) not null default 0;

-- The defaults exist only so the columns can be added `not null` to a table
-- that might have rows. Every writer supplies all three, and a line with no
-- price is a line that should never have been written.
alter table invoice_line_items
  alter column quantity   drop default,
  alter column unit_price drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'invoice_line_items'::regclass
      and conname  = 'invoice_line_items_unit_check'
  ) then
    alter table invoice_line_items
      add constraint invoice_line_items_unit_check
      check (unit in ('hour', 'fixed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'invoice_line_items'::regclass
      and conname  = 'invoice_line_items_quantity_check'
  ) then
    alter table invoice_line_items
      add constraint invoice_line_items_quantity_check check (quantity >= 0);
  end if;

  -- A flat charge is one of something by definition; letting it carry 3.5
  -- would put a quantity on the document the amount does not reflect.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'invoice_line_items'::regclass
      and conname  = 'fixed_line_is_one'
  ) then
    alter table invoice_line_items
      add constraint fixed_line_is_one check (unit <> 'fixed' or quantity = 1);
  end if;
end $$;
