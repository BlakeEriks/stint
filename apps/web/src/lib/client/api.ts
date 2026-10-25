'use client';

import { forgetCache } from './query-cache';
import type { z } from 'zod';
import type * as schema from '@stint/schema';
import type { ImportPreview, ImportResult } from '@stint/core';

/**
 * Browser-side API access.
 *
 * The web app authenticates by cookie, so requests carry no bearer token —
 * `requireSession` handles both paths. Errors become `ApiError` so callers
 * can branch on a code (a 409 from the timer is a normal flow, not a crash).
 */

/**
 * Deliberately NOT `z.infer<typeof schema.ApiError>`: that types `code` as the
 * `ErrorCode` enum, and a client should not fail to parse an error just
 * because a newer server introduced a code it has not heard of. Widening to
 * `string` is what lets the unknown case fall through to generic handling.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** A timer is already running; `details.running` carries it. */
  get isTimerConflict() {
    return this.code === 'TIMER_ALREADY_RUNNING';
  }

  get isUnauthorized() {
    return this.code === 'UNAUTHORIZED';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body && !form ? { 'content-type': 'application/json' } : undefined,
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A failed response as an `ApiError`, which also sends a 401 to sign in. */
async function failure(res: globalThis.Response): Promise<ApiError> {
  const text = await res.text();
  let body: ApiErrorBody | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch (parse) {
    // A platform error page — Vercel's 504 is plain text — not one of ours.
    if (!(parse instanceof SyntaxError)) throw parse;
  }
  const error = new ApiError(
    res.status,
    body ?? { code: 'UNKNOWN', message: res.statusText },
  );

  /*
   * An expired or cleared session sends the user to sign in, from wherever
   * they were. Without this a signed-out page renders its shell and then
   * sits on "Loading…" forever — a 401 fails every retry React Query
   * makes, so it never resolves into anything the user can act on.
   * Hitting Back after signing out did exactly that.
   *
   * A hard assignment rather than the router: this is reachable from any
   * component, including ones with no router in scope, and a full load is
   * what guarantees no server-rendered authenticated markup survives.
   */
  if (
    error.isUnauthorized &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/signin'
  ) {
    forgetCache();
    window.location.assign('/signin');
  }
  return error;
}

// ── shapes the UI consumes ─────────────────────────────────────────
/*
 * These DERIVE from `@stint/schema` rather than copying it, so a field added
 * or removed there is a compile error here.
 *
 * `Response<T>` is why a plain `z.infer` is not enough. A schema marks a field
 * `.optional()` to say a REQUEST may omit it, so `z.infer` yields
 * `field?: T | undefined`. Every converter in `rows.ts` sets every field
 * unconditionally — absent values arrive as `null`, never missing — so a
 * response has no optional fields, and typing them as optional would push a
 * pointless `?? null` through the whole UI.
 */
type Response<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

export type TimeEntry = Response<schema.TimeEntry>;
export type Project = Response<schema.Project>;
export type Client = Response<schema.Client>;
export type ClientWithScale = Response<schema.ClientWithScale>;
export type Settings = Response<schema.Settings>;
export type Account = Response<schema.Account>;
export type Billing = Response<schema.Billing>;
export type PaymentProfile = Response<schema.PaymentProfile>;
export type InvoicePreview = Response<schema.InvoicePreview>;
export type Invoice = Response<schema.Invoice>;
export type Expense = Response<schema.Expense>;
export type ManualLine = schema.ManualLine;
export type TaskNameSuggestion = Response<schema.TaskNameSuggestion>;

/* Nested objects keep their own optionality, so `Response` is applied only at
   the top level here — every nested field is already required. */
export type Stats = Response<schema.Stats>;

export type CalendarDay = Response<Omit<schema.CalendarDay, 'entries'>> & {
  entries: TimeEntry[];
};

export type Summary = Response<Omit<schema.Summary, 'running'>> & {
  running: TimeEntry | null;
};

export type IncludedName = schema.IncludedName;
/** What a write returns beside its record when asked (`docs/api.md`). */
export type Included = { summary?: Summary; stats?: Stats };
/** A write's `?include=`: the reads to return, and the zone they're in. */
export type Include = { names: readonly IncludedName[]; tz: string };

const zone = () =>
  `tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`;

export type StoppedTimer = { entry: TimeEntry; included?: Included } & Pick<
  Stats,
  'currency' | 'unbilled'
>;
/** A start or entry `PATCH` that asked to `include`. */
export type WrittenEntry = { entry: TimeEntry; included: Included };

const withInclude = (path: string, include?: Include) =>
  include?.names.length
    ? `${path}?include=${include.names.join(',')}&tz=${encodeURIComponent(include.tz)}`
    : path;

export type GroupingMode = z.infer<typeof schema.GroupingMode>;
export type ScheduleKind = z.infer<typeof schema.ScheduleKind>;
export type InvoiceStatus = z.infer<typeof schema.InvoiceStatus>;
export type ComputedLineItem = Response<schema.ComputedLineItem>;
export type InvoiceLineItem = Response<schema.InvoiceLineItem>;
export type UnratedEntry = Response<schema.UnratedEntry>;
export type DraftChange = Response<schema.DraftChange>;

/** Everything a project is created or edited with. */
export type ProjectInput = Partial<Omit<Project, 'id' | 'archivedAt'>> &
  Pick<Project, 'name'>;

/** Everything a client is created or edited with. `id` is server-defaulted. */
export type ClientInput = Partial<Omit<Client, 'id' | 'archivedAt'>> &
  Pick<Client, 'name'>;

export type SettingsInput = Partial<Settings>;

/** Everything an expense is recorded or edited with. */
export type ExpenseInput = Pick<
  Expense,
  'clientId' | 'recurring' | 'spentOn' | 'description' | 'amount'
> &
  Partial<Pick<Expense, 'note'>>;

export type PaymentProfileInput = Partial<
  Omit<PaymentProfile, 'id' | 'archivedAt'>
> &
  Pick<PaymentProfile, 'name'>;

export const api = {
  /** A Toggl export, plus the zone its wall-clock times are in. */
  importPreview: (form: FormData) =>
    request<ImportPreview>('POST', '/imports/preview', form),

  importConfirm: (form: FormData) =>
    request<ImportResult>('POST', '/imports/confirm', form),

  summary: (tz: string) =>
    request<Summary>('GET', `/summary?tz=${encodeURIComponent(tz)}`),

  stats: (tz: string) =>
    request<Stats>('GET', `/stats?tz=${encodeURIComponent(tz)}`),

  entries: (
    params: {
      from?: string;
      to?: string;
      /** A project id, or `'none'` for entries with no project. */
      projectId?: string | 'none';
    } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    if (params.projectId) q.set('projectId', params.projectId);
    const s = q.toString();
    return request<{ entries: TimeEntry[] }>(
      'GET',
      `/entries${s ? `?${s}` : ''}`,
    );
  },

  startTimer: (
    body: {
      id?: string;
      taskName: string;
      projectId?: string | null;
      isBillable?: boolean;
    },
    include: Include,
  ) =>
    request<WrittenEntry>('POST', withInclude('/timer/start', include), body),

  stopTimer: (include?: Include) =>
    request<StoppedTimer>('POST', withInclude('/timer/stop', include), {}),

  updateRunning: (body: { taskName?: string; projectId?: string | null }) =>
    request<TimeEntry>('PATCH', '/timer/current', body),

  /**
   * A completed manual entry. `id` is a client-generated UUIDv7 (`uuidv7()`
   * in `@stint/core`) so a retried insert lands on the same row rather than
   * duplicating it — the server returns the existing entry with 200.
   */
  createEntry: (body: {
    id: string;
    taskName: string;
    projectId?: string | null;
    startedAt: string;
    endedAt: string;
    isBillable?: boolean;
  }) => request<TimeEntry>('POST', '/entries', body),

  /** One entry by id, for a surface that holds a reference rather than a row. */
  entry: (id: string) => request<TimeEntry>('GET', `/entries/${id}`),

  updateEntry: (
    id: string,
    body: Partial<
      Pick<
        TimeEntry,
        | 'taskName'
        | 'projectId'
        | 'startedAt'
        | 'endedAt'
        | 'isBillable'
        | 'durationOk'
      >
    >,
  ) => request<TimeEntry>('PATCH', `/entries/${id}`, body),

  deleteEntry: (id: string) => request<void>('DELETE', `/entries/${id}`),

  /**
   * Recently used task names, ranked by the server and never re-sorted.
   * `projectId` is a preference rather than a filter: its names rank first
   * and the rest still follow, so omitting it ranks by recency alone.
   */
  taskNames: (opts: { projectId?: string | null; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.projectId) q.set('projectId', opts.projectId);
    if (opts.limit) q.set('limit', String(opts.limit));
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ taskNames: TaskNameSuggestion[] }>(
      'GET',
      `/entries/task-names${query}`,
    );
  },

  projects: (opts: { includeArchived?: boolean; clientId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.includeArchived) q.set('includeArchived', 'true');
    if (opts.clientId) q.set('clientId', opts.clientId);
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ projects: Project[] }>('GET', `/projects${query}`);
  },

  createProject: (body: ProjectInput & { id?: string }) =>
    request<Project>('POST', '/projects', body),

  updateProject: (id: string, body: Partial<ProjectInput>) =>
    request<Project>('PATCH', `/projects/${id}`, body),

  /** Archival, not deletion — entries and invoices reference projects. */
  archiveProject: (id: string) => request<void>('DELETE', `/projects/${id}`),

  restoreProject: (id: string) =>
    request<Project>('PATCH', `/projects/${id}`, { archived: false }),

  /** Archived clients are excluded unless asked for. */
  /* Overloaded so `withScale` narrows the result: without it every caller of
     the plain list would carry fields the server did not send. */
  clients: ((opts: { includeArchived?: boolean; withScale?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.includeArchived) q.set('includeArchived', 'true');
    if (opts.withScale) q.set('withScale', 'true');
    const query = q.size > 0 ? `?${q}` : '';
    return request<{ clients: Client[] | ClientWithScale[] }>(
      'GET',
      `/clients${query}`,
    );
  }) as {
    (opts: {
      includeArchived?: boolean;
      withScale: true;
    }): Promise<{
      clients: ClientWithScale[];
    }>;
    (opts?: {
      includeArchived?: boolean;
      withScale?: false;
    }): Promise<{
      clients: Client[];
    }>;
  },

  createClient: (body: ClientInput) =>
    request<Client>('POST', '/clients', body),

  updateClient: (id: string, body: Partial<ClientInput>) =>
    request<Client>('PATCH', `/clients/${id}`, body),

  /** Archival, not deletion — invoices reference clients. */
  archiveClient: (id: string) => request<void>('DELETE', `/clients/${id}`),

  /** Only the client: its projects keep their own archivedAt, so what was
      active before it was archived comes back, and nothing else. */
  restoreClient: (id: string) =>
    request<Client>('PATCH', `/clients/${id}`, { archived: false }),

  calendar: (params: { from: string; to: string; tz: string }) => {
    const q = new URLSearchParams(params);
    return request<{ days: CalendarDay[] }>('GET', `/calendar?${q}`);
  },

  invoices: (params: { clientId?: string; status?: InvoiceStatus } = {}) => {
    const q = new URLSearchParams(params as Record<string, string>);
    return request<{ invoices: Invoice[] }>('GET', `/invoices?${q}&${zone()}`);
  },

  /* The invoice is FLAT, matching every other detail route (`/clients/:id`,
     `/projects/:id`), with the line items alongside it. */
  invoice: (id: string) =>
    request<
      Invoice & {
        /** `isNew`: on a draft, a line its last PDF didn't have. */
        lineItems: (InvoiceLineItem & { isNew: boolean })[];
        canDownload: boolean;
        changedSinceDownload: DraftChange | null;
        unratedEntries: UnratedEntry[];
        dueBeforeIssue: boolean;
      }
    >('GET', `/invoices/${id}?${zone()}`),

  /** No side effects — this is what the user approves before generating. */
  previewInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    summaryText?: string;
    tz?: string;
    manualLines?: ManualLine[];
    excludedExpenseIds?: string[];
  }) => request<InvoicePreview>('POST', '/invoices/preview', body),

  /** Allocates the number and creates the draft, which bills its period's
   *  work until it is sent. */
  createInvoice: (body: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    groupingMode?: GroupingMode;
    summaryText?: string;
    tz?: string;
    manualLines?: ManualLine[];
    excludedExpenseIds?: string[];
    schedules?: ScheduleKind[];
    reference?: string;
    paymentProfileId?: string;
    dueDate?: string;
    notes?: string;
  }) =>
    request<Invoice & { lineItems: ComputedLineItem[]; entryCount: number }>(
      'POST',
      '/invoices',
      body,
    ),

  updateInvoiceStatus: (
    id: string,
    body: { status: InvoiceStatus; sentAt?: string; paidAt?: string },
  ) =>
    request<Invoice>(
      'PATCH',
      // A draft is sent as its period's work stands, read in its zone.
      `/invoices/${id}/status${body.status === 'sent' ? `?${zone()}` : ''}`,
      body,
    ),

  /** Drafts only. An issued invoice must be voided so numbering stays gapless. */
  deleteInvoice: (id: string) => request<void>('DELETE', `/invoices/${id}`),

  /** Recurring first, then oldest first. `open` (the default) is what a
   *  client's card lists; `unbilled` is what an invoice can take. */
  expenses: (
    params: { clientId?: string; status?: 'open' | 'unbilled' } = {},
  ) => {
    const q = new URLSearchParams(params as Record<string, string>);
    return request<{ expenses: Expense[] }>('GET', `/expenses?${q}`);
  },

  /** `id` is a client-generated UUIDv7, made once per recording, so a
   *  retried request lands on the same row rather than recording it twice. */
  createExpense: (body: ExpenseInput & { id: string }) =>
    request<Expense>('POST', '/expenses', body),

  sendFeedback: (body: schema.CreateFeedback) =>
    request<{ id: string }>('POST', '/feedback', body),

  updateExpense: (id: string, body: Partial<ExpenseInput>) =>
    request<Expense>('PATCH', `/expenses/${id}`, body),

  deleteExpense: (id: string) => request<void>('DELETE', `/expenses/${id}`),

  /** A CSV export, and the name the server gave it. */
  exportCsv: async (kind: 'entries' | 'invoices', tz: string) => {
    const res = await fetch(
      `/api/v1/exports/${kind}?tz=${encodeURIComponent(tz)}`,
    );
    if (!res.ok) throw await failure(res);
    const name = /filename="([^"]+)"/.exec(
      res.headers.get('content-disposition') ?? '',
    )?.[1];
    return { blob: await res.blob(), filename: name ?? `stint-${kind}.csv` };
  },

  invoicePdfUrl: (id: string, download = false) =>
    `/api/v1/invoices/${id}/pdf?${zone()}${download ? '&download=1' : ''}`,

  settings: () => request<Settings>('GET', '/settings'),

  updateSettings: (body: SettingsInput) =>
    request<Settings>('PATCH', '/settings', body),

  paymentProfiles: () =>
    request<{ paymentProfiles: PaymentProfile[] }>('GET', '/payment-profiles'),

  createPaymentProfile: (body: PaymentProfileInput) =>
    request<PaymentProfile>('POST', '/payment-profiles', body),

  updatePaymentProfile: (id: string, body: Partial<PaymentProfileInput>) =>
    request<PaymentProfile>('PATCH', `/payment-profiles/${id}`, body),

  archivePaymentProfile: (id: string) =>
    request<void>('DELETE', `/payment-profiles/${id}`),

  account: () => request<Account>('GET', '/account'),

  deleteAccount: () => request<void>('DELETE', '/account'),

  billing: () => request<Billing>('GET', '/billing'),

  /** A Stripe Checkout URL for the yearly price. */
  checkout: () => request<schema.BillingRedirect>('POST', '/billing/checkout'),

  /** A Stripe Customer Portal URL: cancel, resume, card, receipts. */
  billingPortal: () =>
    request<schema.BillingRedirect>('POST', '/billing/portal'),

  /** Back from Checkout: store what Stripe says about that session now. */
  syncCheckout: (sessionId: string) =>
    request<Billing>('POST', '/billing/sync', { sessionId }),
};
