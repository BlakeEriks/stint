/**
 * The API contract. Single source of truth.
 *
 * Web and Expo import these directly. The macOS Swift client can't, so an
 * OpenAPI spec is generated from these schemas to keep hand-written Swift
 * models honest — see `pnpm --filter @tt/schema openapi`.
 */

import { z } from 'zod';

export const uuid = z.uuid();
export const iso = z.iso.datetime({ offset: true });
export const money = z.number().nonnegative().multipleOf(0.01);
export const currency = z.string().length(3);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ── client ─────────────────────────────────────────────────────────
export const Client = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(200),
  email: z.email().nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  hourlyRate: money.nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  currency: currency.nullable().optional(),
  color: hexColor.nullable().optional(),
  archivedAt: iso.nullable().optional(),
});
export const CreateClient = Client.omit({ id: true, archivedAt: true }).extend({
  id: uuid.optional(), // client-generated UUIDv7 for idempotent retries
});
export const UpdateClient = CreateClient.partial().omit({ id: true });

// ── project ────────────────────────────────────────────────────────
export const Project = z.object({
  id: uuid,
  clientId: uuid.nullable(),          // null = internal / unbilled work
  name: z.string().trim().min(1).max(200),
  hourlyRate: money.nullable().optional(),
  color: hexColor.nullable().optional(),
  isBillableDefault: z.boolean().default(true),
  archivedAt: iso.nullable().optional(),
});
export const CreateProject = Project.omit({ id: true, archivedAt: true }).extend({
  id: uuid.optional(),
});
export const UpdateProject = CreateProject.partial().omit({ id: true });

// ── time entry ─────────────────────────────────────────────────────
export const TimeEntry = z.object({
  id: uuid,
  projectId: uuid.nullable(),
  taskName: z.string().max(500).default(''),
  startedAt: iso,
  endedAt: iso.nullable(),            // null == running
  isBillable: z.boolean().default(true),
  rateOverride: money.nullable().optional(),
  invoiceId: uuid.nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable(),
});

/** Manual entry creation. The id is client-supplied so replay is safe. */
export const CreateTimeEntry = z.object({
  id: uuid,
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).default(''),
  startedAt: iso,
  endedAt: iso,                       // manual entries are always complete
  isBillable: z.boolean().optional(),
  rateOverride: money.nullable().optional(),
}).refine((e) => new Date(e.endedAt) > new Date(e.startedAt), {
  message: 'endedAt must be after startedAt',
  path: ['endedAt'],
});

export const UpdateTimeEntry = z.object({
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).optional(),
  startedAt: iso.optional(),
  endedAt: iso.nullable().optional(),
  isBillable: z.boolean().optional(),
  rateOverride: money.nullable().optional(),
});

// ── timer ──────────────────────────────────────────────────────────
export const StartTimer = z.object({
  id: uuid.optional(),
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).default(''),
  startedAt: iso.optional(),          // allows backdating a forgotten start
});

export const StopTimer = z.object({
  endedAt: iso.optional(),            // defaults to server now()
});

/** GET /timer/current */
export const CurrentTimer = z.object({
  entry: TimeEntry.nullable(),
  /** Server-computed against user_settings.max_timer_hours. */
  exceedsThreshold: z.boolean(),
  maxTimerHours: z.number().positive(),
  serverTime: iso,                    // lets clients correct for clock skew
});

// ── summary (the menu bar endpoint) ────────────────────────────────
export const Summary = z.object({
  running: TimeEntry.nullable(),
  todaySeconds: z.number().int().nonnegative(),
  weekSeconds: z.number().int().nonnegative(),
  serverTime: iso,
});

// ── settings ───────────────────────────────────────────────────────
export const Settings = z.object({
  defaultHourlyRate: money.nullable(),
  currency,
  weekStartsOn: z.number().int().min(0).max(6),
  timeFormat: z.enum(['12h', '24h']),
  maxTimerHours: z.number().positive().max(24),
  businessName: z.string().max(200).nullable(),
  businessAddress: z.string().max(1000).nullable(),
  businessEmail: z.email().nullable(),
  logoUrl: z.url().nullable(),
  taxId: z.string().max(100).nullable(),
  defaultPaymentTerms: z.string().max(200),
  invoiceNumberPrefix: z.string().max(20),
  nextInvoiceNumber: z.number().int().positive(),
});
export const UpdateSettings = Settings.partial();

// ── invoicing ──────────────────────────────────────────────────────
export const GroupingMode = z.enum(['entry', 'task', 'project', 'day']);

export const InvoicePreviewRequest = z.object({
  clientId: uuid,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  groupingMode: GroupingMode.default('entry'),
});

export const InvoiceLineItem = z.object({
  description: z.string(),
  quantitySeconds: z.number().int().nonnegative(),
  quantityHours: z.number().nonnegative(),
  resolvedRate: money,
  rateSource: z.enum(['entry', 'project', 'client', 'default', 'none']),
  amount: money,
});

export const InvoicePreview = z.object({
  clientId: uuid,
  lineItems: z.array(InvoiceLineItem),
  subtotal: money,
  taxRate: z.number().min(0).max(100),
  taxAmount: money,
  total: money,
  currency,
  entryCount: z.number().int().nonnegative(),
  /** Entries with no resolvable rate — blocks generation until fixed. */
  unratedEntryIds: z.array(uuid),
});

export const CreateInvoice = InvoicePreviewRequest.extend({
  dueDate: z.iso.date().optional(),
  notes: z.string().max(2000).optional(),
  paymentTerms: z.string().max(200).optional(),
});

export const InvoiceStatus = z.enum(['draft', 'sent', 'paid', 'void']);
export const UpdateInvoiceStatus = z.object({ status: InvoiceStatus });

// ── sync ───────────────────────────────────────────────────────────
export const SyncMutation = z.object({
  id: uuid,
  entity: z.enum(['time_entry', 'client', 'project', 'settings']),
  entityId: uuid,
  op: z.enum(['create', 'update', 'delete']),
  payload: z.record(z.string(), z.unknown()),
  clientUpdatedAt: iso,
});

export const SyncRequest = z.object({
  mutations: z.array(SyncMutation).max(500),
  cursor: z.string().nullable(),
});

export const SyncResponse = z.object({
  applied: z.array(uuid),
  rejected: z.array(z.object({
    id: uuid,
    reason: z.string(),
    code: z.string(),
  })),
  changes: z.object({
    timeEntries: z.array(TimeEntry),
    clients: z.array(Client),
    projects: z.array(Project),
  }),
  cursor: z.string(),
  serverTime: iso,
});

// ── errors ─────────────────────────────────────────────────────────
export const ErrorCode = z.enum([
  'TIMER_ALREADY_RUNNING',
  'NO_TIMER_RUNNING',
  'ENTRY_LOCKED',
  'ENTRY_NOT_FOUND',
  'NO_RATE_CONFIGURED',
  'INVALID_PERIOD',
  'UNAUTHORIZED',
  'VALIDATION_FAILED',
]);

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});

export type Client = z.infer<typeof Client>;
export type Project = z.infer<typeof Project>;
export type TimeEntry = z.infer<typeof TimeEntry>;
export type CurrentTimer = z.infer<typeof CurrentTimer>;
export type Summary = z.infer<typeof Summary>;
export type Settings = z.infer<typeof Settings>;
export type InvoicePreview = z.infer<typeof InvoicePreview>;
export type SyncRequest = z.infer<typeof SyncRequest>;
export type SyncResponse = z.infer<typeof SyncResponse>;
export type ApiError = z.infer<typeof ApiError>;
