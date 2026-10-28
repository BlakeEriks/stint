import { BILLING_PERIODS, needsAnchor } from '@stint/core';
import { z } from 'zod';
import {
  boolParam,
  currency,
  hexColor,
  iso,
  money,
  termsDays,
  uuid,
} from './primitives.ts';

// ── client ─────────────────────────────────────────────────────────
/** How often a client's contract bills it (`BillingSchedule` in
 *  `@stint/core`). Strict, so an anchor on a calendar period is refused
 *  rather than dropped. */
export const BillingSchedule = z.discriminatedUnion('period', [
  z.strictObject({
    period: z.enum(BILLING_PERIODS.filter(needsAnchor)),
    anchor: z.iso.date(),
  }),
  z.strictObject({
    period: z.enum(BILLING_PERIODS.filter((p) => !needsAnchor(p))),
  }),
]);

export const Client = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(200),
  email: z.email().nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  hourlyRate: money.nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  currency: currency.nullable().optional(),
  color: hexColor.nullable().optional(),
  /** Overrides the user's default payment profile on this client's invoices;
   *  a dangling reference falls back rather than rendering nothing. */
  paymentProfileId: uuid.nullable().optional(),
  /** Null is no schedule; omitted on a PATCH leaves it as it is. */
  billingSchedule: BillingSchedule.nullable().optional(),
  /** Overrides the user's payment terms; null uses them. */
  paymentTermsDays: termsDays.nullable().optional(),
  archivedAt: iso.nullable().optional(),
});
export const CreateClient = Client.omit({ id: true, archivedAt: true }).extend({
  id: uuid.optional(), // client-generated UUIDv7 for idempotent retries
});

/**
 * A client plus how much work sits under it — `?withScale=true` only.
 *
 * Separate from `Client` because these are derived, response-only figures: on
 * `Client` they would flow into `CreateClient` and imply they are writable.
 */
export const ClientWithScale = Client.extend({
  projectCount: z.number().int().nonnegative(),
  /** Unbilled work at resolved rates. `0` is a real answer, not a missing
   *  one — the list must not render it as "unknown". */
  unbilledAmount: money,
});
export const UpdateClient = CreateClient.partial()
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });

export const ListClientsQuery = z.object({
  includeArchived: boolParam,
  /** Project count and unbilled total per client. Opt-in: the plain list is
   *  one cheap query and most callers (pickers, dialogs) want only that. */
  withScale: boolParam,
});

// ── project ────────────────────────────────────────────────────────
/** No `color` — color identifies a client. */
export const Project = z.object({
  id: uuid,
  clientId: uuid.nullable(), // null = internal / unbilled work
  name: z.string().trim().min(1).max(200),
  hourlyRate: money.nullable().optional(),
  isBillableDefault: z.boolean().default(true),
  archivedAt: iso.nullable().optional(),
});
export const CreateProject = Project.omit({
  id: true,
  archivedAt: true,
}).extend({
  id: uuid.optional(),
  clientId: uuid.nullable().optional(), // omitted == internal work
});
export const UpdateProject = CreateProject.partial()
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });

export const ListProjectsQuery = z.object({
  clientId: uuid.optional(),
  includeArchived: boolParam,
});

export type Client = z.infer<typeof Client>;
export type Project = z.infer<typeof Project>;
export type ClientWithScale = z.infer<typeof ClientWithScale>;
