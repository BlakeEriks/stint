/**
 * The single boundary between database rows (snake_case) and the API
 * contract (camelCase). Nothing else in the codebase should know both
 * spellings — if a field is renamed, it is renamed here.
 */

export interface EntryRow {
  id: string;
  project_id: string | null;
  task_name: string;
  started_at: string;
  ended_at: string | null;
  is_billable: boolean;
  rate_override: string | number | null;
  invoice_id: string | null;
  duration_seconds: number | null;
}

/** numeric columns arrive as strings from PostgREST to preserve precision. */
const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

export const ENTRY_COLUMNS =
  'id, project_id, task_name, started_at, ended_at, is_billable, rate_override, invoice_id, duration_seconds';

export function toEntry(r: EntryRow) {
  return {
    id: r.id,
    projectId: r.project_id,
    taskName: r.task_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    isBillable: r.is_billable,
    rateOverride: num(r.rate_override),
    invoiceId: r.invoice_id,
    durationSeconds: r.duration_seconds,
  };
}

export const CLIENT_COLUMNS =
  'id, name, email, address, hourly_rate, tax_rate, currency, color, payment_profile_id, archived_at';

export function toClient(r: Record<string, any>) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    address: r.address,
    hourlyRate: num(r.hourly_rate),
    taxRate: num(r.tax_rate),
    currency: r.currency,
    color: r.color,
    paymentProfileId: r.payment_profile_id,
    archivedAt: r.archived_at,
  };
}

/* No `color`: colour identifies a client, not a project. The column still
   exists — retiring one is two releases — but nothing reads or writes it. */
export const PROJECT_COLUMNS =
  'id, client_id, name, hourly_rate, is_billable_default, archived_at';

export function toProject(r: Record<string, any>) {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    hourlyRate: num(r.hourly_rate),
    isBillableDefault: r.is_billable_default,
    archivedAt: r.archived_at,
  };
}

export const SETTINGS_COLUMNS =
  'default_hourly_rate, currency, week_starts_on, time_format, max_timer_hours, business_name, business_address, business_email, logo_url, tax_id, default_payment_terms, invoice_number_prefix, next_invoice_number, payment_notice, monthly_target, monthly_target_unit';

export function toSettings(r: Record<string, any>) {
  return {
    defaultHourlyRate: num(r.default_hourly_rate),
    currency: r.currency,
    weekStartsOn: r.week_starts_on,
    timeFormat: r.time_format,
    maxTimerHours: Number(r.max_timer_hours),
    businessName: r.business_name,
    businessAddress: r.business_address,
    businessEmail: r.business_email,
    logoUrl: r.logo_url,
    taxId: r.tax_id,
    defaultPaymentTerms: r.default_payment_terms,
    invoiceNumberPrefix: r.invoice_number_prefix,
    nextInvoiceNumber: r.next_invoice_number,
    paymentNotice: r.payment_notice,
    monthlyTarget: num(r.monthly_target),
    monthlyTargetUnit: r.monthly_target_unit,
  };
}

/** camelCase patch -> snake_case column update, dropping undefined keys. */
export function toColumns(
  patch: Record<string, unknown>,
  map: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) out[column] = patch[key];
  }
  return out;
}

export const ENTRY_FIELDS = {
  projectId: 'project_id',
  taskName: 'task_name',
  startedAt: 'started_at',
  endedAt: 'ended_at',
  isBillable: 'is_billable',
  rateOverride: 'rate_override',
} as const;

export const CLIENT_FIELDS = {
  name: 'name',
  email: 'email',
  address: 'address',
  hourlyRate: 'hourly_rate',
  taxRate: 'tax_rate',
  currency: 'currency',
  color: 'color',
  paymentProfileId: 'payment_profile_id',
} as const;

export const PROJECT_FIELDS = {
  clientId: 'client_id',
  name: 'name',
  hourlyRate: 'hourly_rate',
  isBillableDefault: 'is_billable_default',
} as const;

export const SETTINGS_FIELDS = {
  defaultHourlyRate: 'default_hourly_rate',
  currency: 'currency',
  weekStartsOn: 'week_starts_on',
  timeFormat: 'time_format',
  maxTimerHours: 'max_timer_hours',
  businessName: 'business_name',
  businessAddress: 'business_address',
  businessEmail: 'business_email',
  logoUrl: 'logo_url',
  taxId: 'tax_id',
  defaultPaymentTerms: 'default_payment_terms',
  invoiceNumberPrefix: 'invoice_number_prefix',
  paymentNotice: 'payment_notice',
  monthlyTarget: 'monthly_target',
  monthlyTargetUnit: 'monthly_target_unit',
} as const;

// ── payment profiles ───────────────────────────────────────────────
// One string literal, not a concatenation — supabase-js infers the row
// type from the literal.
export const PAYMENT_PROFILE_COLUMNS =
  'id, name, is_default, account_holder_name, account_holder_address, bank_name, bank_address, account_number, routing_number, account_type, iban, swift_bic, local_code_label, local_code, intermediary_bank_name, intermediary_swift_bic, intermediary_account_number, payment_link_label, payment_link_url, currency, fee_allocation, notes, archived_at';

export function toPaymentProfile(r: Record<string, any>) {
  return {
    id: r.id,
    name: r.name,
    isDefault: r.is_default,
    accountHolderName: r.account_holder_name,
    accountHolderAddress: r.account_holder_address,
    bankName: r.bank_name,
    bankAddress: r.bank_address,
    accountNumber: r.account_number,
    routingNumber: r.routing_number,
    accountType: r.account_type,
    iban: r.iban,
    swiftBic: r.swift_bic,
    localCodeLabel: r.local_code_label,
    localCode: r.local_code,
    intermediaryBankName: r.intermediary_bank_name,
    intermediarySwiftBic: r.intermediary_swift_bic,
    intermediaryAccountNumber: r.intermediary_account_number,
    paymentLinkLabel: r.payment_link_label,
    paymentLinkUrl: r.payment_link_url,
    currency: r.currency,
    feeAllocation: r.fee_allocation,
    notes: r.notes,
    archivedAt: r.archived_at,
  };
}

export const PAYMENT_PROFILE_FIELDS = {
  name: 'name',
  isDefault: 'is_default',
  accountHolderName: 'account_holder_name',
  accountHolderAddress: 'account_holder_address',
  bankName: 'bank_name',
  bankAddress: 'bank_address',
  accountNumber: 'account_number',
  routingNumber: 'routing_number',
  accountType: 'account_type',
  iban: 'iban',
  swiftBic: 'swift_bic',
  localCodeLabel: 'local_code_label',
  localCode: 'local_code',
  intermediaryBankName: 'intermediary_bank_name',
  intermediarySwiftBic: 'intermediary_swift_bic',
  intermediaryAccountNumber: 'intermediary_account_number',
  paymentLinkLabel: 'payment_link_label',
  paymentLinkUrl: 'payment_link_url',
  currency: 'currency',
  feeAllocation: 'fee_allocation',
  notes: 'notes',
} as const;
