-- ═══════════════════════════════════════════════════════════════════
-- Payment profiles.
--
-- Bank details belong on the invoice PDF, never in the email body. That
-- is the universal convention among invoicing tools, and it is the safer
-- posture: details that appear identically on every invoice create a
-- baseline, so a CHANGE becomes visible and questionable — which is
-- exactly what fraud-prevention guidance tells payers to challenge.
--
-- US-first. ACH (routing + account) is the default path; international
-- fields exist but are additive, not the baseline.
-- ═══════════════════════════════════════════════════════════════════

create table payment_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- What the user calls this ("USD wire", "Checks", "Wise EUR").
  name        text not null check (length(trim(name)) > 0),
  is_default  boolean not null default false,

  -- ── beneficiary ──────────────────────────────────────────────────
  -- Must match the bank record exactly, or the wire is returned.
  account_holder_name    text,
  account_holder_address text,

  -- ── bank ─────────────────────────────────────────────────────────
  bank_name     text,
  bank_address  text,
  account_number text,
  -- US ACH/wire. The default rail.
  routing_number text,
  account_type   text check (account_type is null or account_type in ('checking','savings')),

  -- ── international (additive) ─────────────────────────────────────
  iban       text,
  swift_bic  text,
  -- Sort code, BSB, etc. Labelled so one pair covers every national scheme.
  local_code_label text,
  local_code       text,

  -- Correspondent bank, common for inbound USD.
  intermediary_bank_name   text,
  intermediary_swift_bic   text,
  intermediary_account_number text,

  -- ── alternative rails ────────────────────────────────────────────
  -- Label + value so a new rail needs no migration.
  payment_link_label text,
  payment_link_url   text,

  -- ── meta ─────────────────────────────────────────────────────────
  currency  char(3),
  -- SWIFT charge allocation: who pays the wire fees. A real source of
  -- short payments on international corridors.
  fee_allocation text check (fee_allocation is null or fee_allocation in ('OUR','SHA','BEN')),
  -- Free text shown under the details, e.g. "Please email remittance advice".
  notes text,

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index payment_profiles_user_idx on payment_profiles (user_id) where archived_at is null;

-- At most one default per user. A partial unique index rather than
-- application logic, for the same reason the timer invariant is one.
create unique index one_default_payment_profile_per_user
  on payment_profiles (user_id)
  where is_default and archived_at is null;

create trigger t_payment_profiles_touch before update on payment_profiles
  for each row execute function touch_updated_at();

alter table payment_profiles enable row level security;
create policy own_payment_profiles on payment_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── wiring ─────────────────────────────────────────────────────────

-- A client may prefer a specific profile (a EUR client billed in euros).
-- Null means "use the user's default".
alter table clients
  add column payment_profile_id uuid references payment_profiles(id) on delete set null;

-- Invoices FREEZE the rendered details, the same way they freeze rates.
-- Re-downloading an issued invoice must show the details the client was
-- actually given, even if the profile has since changed — and if the
-- profile is later deleted, the record must survive.
alter table invoices
  add column payment_details jsonb;

comment on column invoices.payment_details is
  'Frozen snapshot of the payment profile at generation time. Never a live lookup.';

-- Standing anti-fraud line, printed near the payment block.
-- Fraud-prevention guidance tells payers to challenge any change of bank
-- details; this puts that instruction where the payer actually reads it.
alter table user_settings
  add column payment_notice text
  default 'Our payment details never change. If you receive any message stating otherwise, call to verify before paying.';
