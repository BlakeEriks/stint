import type * as schema from '@stint/schema';

/**
 * What every client of `/api/v1` shares: the error it throws and the shapes
 * it reads. Each app supplies its own `request` — the web's sends a cookie,
 * the phone's a bearer token.
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

/** A failed response as an `ApiError`, whatever its body. */
export async function readFailure(res: Response): Promise<ApiError> {
  const text = await res.text();
  let body: ApiErrorBody | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch (parse) {
    // A platform error page — Vercel's 504 is plain text — not one of ours.
    if (!(parse instanceof SyntaxError)) throw parse;
  }
  return new ApiError(
    res.status,
    body ?? { code: 'UNKNOWN', message: res.statusText },
  );
}

/** A successful response's JSON, or undefined for an empty one. */
export async function readBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── shapes the UI consumes ─────────────────────────────────────────
/*
 * These DERIVE from `@stint/schema` rather than copying it, so a field added
 * or removed there is a compile error here.
 *
 * `Res<T>` is why a plain `z.infer` is not enough. A schema marks a field
 * `.optional()` to say a REQUEST may omit it, so `z.infer` yields
 * `field?: T | undefined`. Every converter in `rows.ts` sets every field
 * unconditionally — absent values arrive as `null`, never missing — so a
 * response has no optional fields, and typing them as optional would push a
 * pointless `?? null` through the whole UI.
 */
export type Res<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

export type TimeEntry = Res<schema.TimeEntry>;
export type Project = Res<schema.Project>;
export type Client = Res<schema.Client>;
export type TaskNameSuggestion = Res<schema.TaskNameSuggestion>;

/* Nested objects keep their own optionality, so `Res` is applied only at
   the top level here — every nested field is already required. */
export type Stats = Res<schema.Stats>;

export type Summary = Res<Omit<schema.Summary, 'running'>> & {
  running: TimeEntry | null;
};

export type IncludedName = schema.IncludedName;
/** What a write returns beside its record when asked (`docs/api.md`). */
export type Included = { summary?: Summary; stats?: Stats };
/** A write's `?include=`: the reads to return, and the zone they're in. */
export type Include = { names: readonly IncludedName[]; tz: string };

export type StoppedTimer = { entry: TimeEntry; included?: Included } & Pick<
  Stats,
  'currency' | 'unbilled'
>;
/** A start or entry `PATCH` that asked to `include`. */
export type WrittenEntry = { entry: TimeEntry; included: Included };

export const withInclude = (path: string, include?: Include) =>
  include?.names.length
    ? `${path}?include=${include.names.join(',')}&tz=${encodeURIComponent(include.tz)}`
    : path;

export interface StartTimer {
  id?: string;
  taskName: string;
  projectId?: string | null;
  isBillable?: boolean;
}

/** The calls `useTimer` makes, which each app's `api` provides. */
export interface TimerApi {
  summary: (tz: string) => Promise<Summary>;
  startTimer: (body: StartTimer, include: Include) => Promise<WrittenEntry>;
  stopTimer: (include?: Include) => Promise<StoppedTimer>;
  updateRunning: (body: {
    taskName?: string;
    projectId?: string | null;
  }) => Promise<TimeEntry>;
}
