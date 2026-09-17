import type {
  GroupingMode,
  Invoice,
  InvoiceStatus,
  PaymentProfile,
  Settings,
} from '@stint/schema';
import type { z } from 'zod';

/**
 * The single boundary between database rows (snake_case) and the API
 * contract (camelCase). Nothing else in the codebase should know both
 * spellings — if a field is renamed, it is renamed here.
 *
 * Each converter takes a row interface, and `columns()` ties that interface to
 * the select list that fills it — without which a converter reading a column
 * nobody selected type-checks clean and returns `undefined` at runtime.
 */

type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer R} `
    ? Trim<R>
    : S;
type Names<S extends string> = S extends `${infer H},${infer T}`
  ? Trim<H> | Names<T>
  : Trim<S>;

/**
 * A select list, checked both ways against its row interface: a column the
 * row does not declare and a field the list does not select each fail to
 * compile. Returns the literal unchanged, because supabase-js parses it to
 * infer the row type — a `join()` over an array degrades every consumer to
 * an error type.
 */
const columns =
  <Row>() =>
  <S extends string>(
    list: S &
      ([Exclude<keyof Row, Names<S>>] extends [never]
        ? [Exclude<Names<S>, keyof Row>] extends [never]
          ? unknown
          : never
        : never),
  ): S =>
    list;

/** numeric columns arrive as strings from PostgREST to preserve precision. */
type Numeric = string | number | null;

/* A `check (x in (...))` constraint on the column, spelled as the contract's
   own union so the two cannot drift apart silently. */
type PaymentDetails = z.infer<typeof Invoice>['paymentDetails'];

const num = (v: Numeric | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

// ── time entries ───────────────────────────────────────────────────
export interface EntryRow {
  id: string;
  project_id: string | null;
  task_name: string;
  started_at: string;
  ended_at: string | null;
  is_billable: boolean;
  rate_override: Numeric;
  invoice_id: string | null;
  duration_seconds: number | null;
  duration_ok: boolean;
}

export const ENTRY_COLUMNS = columns<EntryRow>()(
  'id, project_id, task_name, started_at, ended_at, is_billable, rate_override, invoice_id, duration_seconds, duration_ok',
);

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
    durationOk: r.duration_ok,
  };
}

/* `recent_task_names` returns a computed shape rather than a table, so there
   is no select list for `columns()` to tie this interface to. */
export interface TaskNameRow {
  task_name: string;
  project_id: string | null;
  last_used_at: string;
}

export function toTaskNameSuggestion(r: TaskNameRow) {
  return {
    taskName: r.task_name,
    projectId: r.project_id,
    lastUsedAt: r.last_used_at,
  };
}

// ── clients ────────────────────────────────────────────────────────
export interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  hourly_rate: Numeric;
  tax_rate: Numeric;
  currency: string | null;
  color: string | null;
  payment_profile_id: string | null;
  archived_at: string | null;
}

export const CLIENT_COLUMNS = columns<ClientRow>()(
  'id, name, email, address, hourly_rate, tax_rate, currency, color, payment_profile_id, archived_at',
);

export function toClient(r: ClientRow) {
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

// ── projects ───────────────────────────────────────────────────────
/* No `color`: the column still exists, but nothing reads or writes it. */
export interface ProjectRow {
  id: string;
  client_id: string | null;
  name: string;
  hourly_rate: Numeric;
  is_billable_default: boolean;
  archived_at: string | null;
}

export const PROJECT_COLUMNS = columns<ProjectRow>()(
  'id, client_id, name, hourly_rate, is_billable_default, archived_at',
);

export function toProject(r: ProjectRow) {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    hourlyRate: num(r.hourly_rate),
    isBillableDefault: r.is_billable_default,
    archivedAt: r.archived_at,
  };
}

// ── settings ───────────────────────────────────────────────────────
export interface SettingsRow {
  default_hourly_rate: Numeric;
  currency: string;
  week_starts_on: number;
  time_format: z.infer<typeof Settings>['timeFormat'];
  max_timer_hours: Numeric;
  min_entry_seconds: number | null;
  max_entry_hours: Numeric;
  business_name: string | null;
  business_address: string | null;
  business_email: string | null;
  logo_url: string | null;
  tax_id: string | null;
  default_payment_terms: string;
  invoice_number_prefix: string;
  next_invoice_number: number;
  payment_notice: string | null;
  monthly_target: Numeric;
  monthly_target_unit: z.infer<typeof Settings>['monthlyTargetUnit'];
}

export const SETTINGS_COLUMNS = columns<SettingsRow>()(
  'default_hourly_rate, currency, week_starts_on, time_format, max_timer_hours, min_entry_seconds, max_entry_hours, business_name, business_address, business_email, logo_url, tax_id, default_payment_terms, invoice_number_prefix, next_invoice_number, payment_notice, monthly_target, monthly_target_unit',
);

export function toSettings(r: SettingsRow) {
  return {
    defaultHourlyRate: num(r.default_hourly_rate),
    currency: r.currency,
    weekStartsOn: r.week_starts_on,
    timeFormat: r.time_format,
    maxTimerHours: Number(r.max_timer_hours),
    minEntrySeconds: r.min_entry_seconds,
    maxEntryHours: num(r.max_entry_hours),
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

// ── payment profiles ───────────────────────────────────────────────
export interface PaymentProfileRow {
  id: string;
  name: string;
  is_default: boolean;
  account_holder_name: string | null;
  account_holder_address: string | null;
  bank_name: string | null;
  bank_address: string | null;
  account_number: string | null;
  routing_number: string | null;
  account_type: z.infer<typeof PaymentProfile>['accountType'];
  iban: string | null;
  swift_bic: string | null;
  local_code_label: string | null;
  local_code: string | null;
  intermediary_bank_name: string | null;
  intermediary_swift_bic: string | null;
  intermediary_account_number: string | null;
  payment_link_label: string | null;
  payment_link_url: string | null;
  currency: string | null;
  fee_allocation: z.infer<typeof PaymentProfile>['feeAllocation'];
  notes: string | null;
  archived_at: string | null;
}

export const PAYMENT_PROFILE_COLUMNS = columns<PaymentProfileRow>()(
  'id, name, is_default, account_holder_name, account_holder_address, bank_name, bank_address, account_number, routing_number, account_type, iban, swift_bic, local_code_label, local_code, intermediary_bank_name, intermediary_swift_bic, intermediary_account_number, payment_link_label, payment_link_url, currency, fee_allocation, notes, archived_at',
);

export function toPaymentProfile(r: PaymentProfileRow) {
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

// ── invoices ───────────────────────────────────────────────────────
export interface InvoiceRow {
  id: string;
  client_id: string;
  invoice_number: string;
  sequence_no: number;
  status: z.infer<typeof InvoiceStatus>;
  issue_date: string;
  due_date: string | null;
  period_start: string;
  period_end: string;
  subtotal: Numeric;
  tax_rate: Numeric;
  tax_amount: Numeric;
  total: Numeric;
  currency: string;
  notes: string | null;
  payment_terms: string | null;
  grouping_mode: z.infer<typeof GroupingMode>;
  payment_details: PaymentDetails;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export const INVOICE_COLUMNS = columns<InvoiceRow>()(
  'id, client_id, invoice_number, sequence_no, status, issue_date, due_date, period_start, period_end, subtotal, tax_rate, tax_amount, total, currency, notes, payment_terms, grouping_mode, payment_details, sent_at, paid_at, created_at',
);

export function toInvoice(r: InvoiceRow) {
  return {
    id: r.id,
    clientId: r.client_id,
    invoiceNumber: r.invoice_number,
    sequenceNo: r.sequence_no,
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    subtotal: num(r.subtotal),
    taxRate: num(r.tax_rate),
    taxAmount: num(r.tax_amount),
    total: num(r.total),
    currency: r.currency,
    notes: r.notes,
    paymentTerms: r.payment_terms,
    groupingMode: r.grouping_mode,
    paymentDetails: r.payment_details ?? null,
    sentAt: r.sent_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

export interface LineItemRow {
  id: string;
  description: string;
  quantity_seconds: number;
  resolved_rate: Numeric;
  amount: Numeric;
  sort_order: number;
}

export const LINE_ITEM_COLUMNS = columns<LineItemRow>()(
  'id, description, quantity_seconds, resolved_rate, amount, sort_order',
);

export function toLineItem(r: LineItemRow) {
  return {
    id: r.id,
    description: r.description,
    quantitySeconds: r.quantity_seconds,
    quantityHours: Math.round((r.quantity_seconds / 3600) * 100) / 100,
    resolvedRate: num(r.resolved_rate),
    amount: num(r.amount),
    sortOrder: r.sort_order,
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
  durationOk: 'duration_ok',
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
  minEntrySeconds: 'min_entry_seconds',
  maxEntryHours: 'max_entry_hours',
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
