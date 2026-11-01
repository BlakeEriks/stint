import { z } from 'zod';
import { iso, money, timeZone, uuid } from './primitives.ts';

// ── time entry ─────────────────────────────────────────────────────
export const TimeEntry = z.object({
  id: uuid,
  projectId: uuid.nullable(),
  taskName: z.string().max(500).default(''),
  startedAt: iso,
  endedAt: iso.nullable(), // null == running
  isBillable: z.boolean().default(true),
  rateOverride: money.nullable().optional(),
  invoiceId: uuid.nullable().optional(),
  /** A running entry's is null, except in `GET /entries`, which measures it
   *  at the response. */
  durationSeconds: z.number().int().nonnegative().nullable(),
  /**
   * The user's answer to "is this length correct?". A trigger clears it
   * whenever the times change, so the answer cannot outlive the length it was
   * given about.
   */
  durationOk: z.boolean().default(false),
  /** Billed from another tool: earned, and never unbilled or invoiced here. */
  invoicedElsewhere: z.boolean().default(false),
});

/** Manual entry creation. The id is client-supplied so replay is safe. */
export const CreateTimeEntry = z
  .object({
    id: uuid,
    projectId: uuid.nullable().optional(),
    taskName: z.string().max(500).default(''),
    startedAt: iso,
    endedAt: iso, // manual entries are always complete
    /** Omitted, the project's billable default applies; billable with no
     *  project. */
    isBillable: z.boolean().optional(),
    rateOverride: money.nullable().optional(),
  })
  .refine((e) => new Date(e.endedAt) > new Date(e.startedAt), {
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
  /** How the inbox's "It's correct" answers the strange-duration row. */
  durationOk: z.boolean().optional(),
  /** `true` is refused on an entry on an invoice. */
  invoicedElsewhere: z.boolean().optional(),
});

/** `POST /entries/invoiced-elsewhere`: the entries a press names, by id. */
export const MarkInvoicedElsewhere = z.object({
  ids: z.array(uuid).min(1).max(1000),
  invoicedElsewhere: z.boolean(),
});

export const ListEntriesQuery = z.object({
  from: iso.optional(),
  to: iso.optional(),
  /* A uuid, or the literal `none` for entries with no project at all.
     Those cannot resolve a rate beyond the user default, so they are the
     ones the inbox surfaces — and `projectId=` (empty) cannot express it,
     since an absent param already means "no filter". */
  projectId: z.union([uuid, z.literal('none')]).optional(),
  clientId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const TASK_NAMES_MAX = 1000;

export const TaskNamesQuery = z.object({
  /* A preference, not a filter: names used with this project rank first and
     every other name still follows. Omitting it ranks by recency alone, which
     is also what the picker's "No project" state wants. */
  projectId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(TASK_NAMES_MAX).default(8),
});

/** One row of `recent_task_names`; ranked by the server and never re-sorted. */
export const TaskNameSuggestion = z.object({
  taskName: z.string(),
  projectId: z.uuid().nullable(),
  lastUsedAt: z.iso.datetime(),
});

// ── timer ──────────────────────────────────────────────────────────
export const StartTimer = z.object({
  id: uuid.optional(),
  projectId: uuid.nullable().optional(),
  taskName: z.string().max(500).default(''),
  startedAt: iso.optional(), // allows backdating a forgotten start
  /** Omitted, the project's billable default applies; billable with no
   *  project. */
  isBillable: z.boolean().optional(),
});

export const StopTimer = z.object({
  endedAt: iso.optional(), // defaults to server now()
});

/** Retitle or reassign a running timer. */
export const UpdateRunningTimer = z.object({
  taskName: z.string().max(500).optional(),
  projectId: uuid.nullable().optional(),
});

// ── push devices (the phones told when the timer changes) ─────────
export const PushPlatform = z.enum(['android']);
const pushToken = z.string().min(1).max(4096);

export const RegisterPushDevice = z.object({
  token: pushToken,
  platform: PushPlatform,
});

export const UnregisterPushDevice = z.object({ token: pushToken });

// ── calendar ───────────────────────────────────────────────────────
export const CalendarQuery = z.object({
  from: iso,
  to: iso,
  tz: timeZone,
});

/** What both granularities share: a local day and its total. Grouped
 *  server-side so every client agrees which day an entry belongs to. */
const CalendarDayBase = z.object({
  date: z.iso.date(),
  totalSeconds: z.number().int().nonnegative(),
});

/** A day with the entries that make it up. */
export const CalendarDay = CalendarDayBase.extend({
  entries: z.array(TimeEntry),
});

export type TimeEntry = z.infer<typeof TimeEntry>;
export type TaskNameSuggestion = z.infer<typeof TaskNameSuggestion>;
export type CalendarDay = z.infer<typeof CalendarDay>;
export type PushPlatform = z.infer<typeof PushPlatform>;
export type RegisterPushDevice = z.infer<typeof RegisterPushDevice>;
