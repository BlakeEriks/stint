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
  'id, name, email, address, hourly_rate, tax_rate, currency, color, archived_at';

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
    archivedAt: r.archived_at,
  };
}

export const PROJECT_COLUMNS =
  'id, client_id, name, hourly_rate, color, is_billable_default, archived_at';

export function toProject(r: Record<string, any>) {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    hourlyRate: num(r.hourly_rate),
    color: r.color,
    isBillableDefault: r.is_billable_default,
    archivedAt: r.archived_at,
  };
}

export const SETTINGS_COLUMNS =
  'default_hourly_rate, currency, week_starts_on, time_format, max_timer_hours, ' +
  'business_name, business_address, business_email, logo_url, tax_id, ' +
  'default_payment_terms, invoice_number_prefix, next_invoice_number';

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
} as const;

export const PROJECT_FIELDS = {
  clientId: 'client_id',
  name: 'name',
  hourlyRate: 'hourly_rate',
  color: 'color',
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
} as const;
