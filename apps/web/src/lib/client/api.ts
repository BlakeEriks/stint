'use client';

/**
 * Browser-side API access.
 *
 * The web app authenticates by cookie, so requests carry no bearer token —
 * `requireSession` handles both paths. Errors become `ApiError` so callers
 * can branch on a code (a 409 from the timer is a normal flow, not a crash).
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, json ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return json as T;
}

// ── shapes the UI consumes ─────────────────────────────────────────
export interface TimeEntry {
  id: string;
  projectId: string | null;
  taskName: string;
  startedAt: string;
  endedAt: string | null;
  isBillable: boolean;
  rateOverride: number | null;
  invoiceId: string | null;
  durationSeconds: number | null;
}

export interface Summary {
  running: TimeEntry | null;
  todaySeconds: number;
  weekSeconds: number;
  exceedsThreshold: boolean;
  maxTimerHours: number;
  serverTime: string;
}

export interface Project {
  id: string;
  clientId: string | null;
  name: string;
  color: string | null;
  isBillableDefault: boolean;
}

export interface Client {
  id: string;
  name: string;
  color: string | null;
}

export const api = {
  summary: (tz: string) =>
    request<Summary>('GET', `/summary?tz=${encodeURIComponent(tz)}`),

  entries: (params: { from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const s = q.toString();
    return request<{ entries: TimeEntry[] }>('GET', `/entries${s ? `?${s}` : ''}`);
  },

  startTimer: (body: { taskName: string; projectId?: string | null }) =>
    request<TimeEntry>('POST', '/timer/start', body),

  stopTimer: () => request<TimeEntry>('POST', '/timer/stop', {}),

  updateRunning: (body: { taskName?: string; projectId?: string | null }) =>
    request<TimeEntry>('PATCH', '/timer/current', body),

  updateEntry: (id: string, body: Partial<Pick<TimeEntry,
    'taskName' | 'projectId' | 'startedAt' | 'endedAt' | 'isBillable'>>) =>
    request<TimeEntry>('PATCH', `/entries/${id}`, body),

  deleteEntry: (id: string) => request<void>('DELETE', `/entries/${id}`),

  projects: () => request<{ projects: Project[] }>('GET', '/projects'),
  clients: () => request<{ clients: Client[] }>('GET', '/clients'),
};
