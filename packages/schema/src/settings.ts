import { SUBSCRIPTION_STATUSES } from '@stint/core';
import { z } from 'zod';
import { InvoiceTemplate } from './invoicing.ts';
import { currency, iso, money, termsDays, uuid } from './primitives.ts';

// ── settings ───────────────────────────────────────────────────────
/** Well under the integer column's limit: the number moves forward only, so
    one near the limit could never be undone and would overflow when
    `allocate_invoice_number()` adds one. */
export const NEXT_INVOICE_NUMBER_MAX = 999_999;

export const Settings = z.object({
  defaultHourlyRate: money.nullable(),
  currency,
  weekStartsOn: z.number().int().min(0).max(6),
  timeFormat: z.enum(['12h', '24h']),

  /**
   * Thresholds for the inbox's strange-duration row. Null switches off that
   * side. The long side defaults to 12 hours, which is how a timer left
   * running overnight reaches the inbox once it is stopped.
   *
   * Seconds on the short side, not minutes: an entry under a minute was
   * started and stopped without work between it.
   */
  minEntrySeconds: z.number().int().positive().nullable(),
  maxEntryHours: z.number().positive().max(24).nullable(),
  businessName: z.string().max(200).nullable(),
  businessAddress: z.string().max(1000).nullable(),
  businessEmail: z.email().nullable(),
  logoUrl: z.url().nullable(),
  paymentTermsDays: termsDays,
  invoiceNumberPrefix: z.string().max(20),
  /** The template drafts render in; a sent invoice keeps its own. */
  invoiceTemplate: InvoiceTemplate,
  nextInvoiceNumber: z.number().int().positive().max(NEXT_INVOICE_NUMBER_MAX),
  /** When the welcome dialog was finished or skipped; null shows it. */
  welcomedAt: iso.nullable(),
});
/** `nextInvoiceNumber` moves forward only, under its ceiling. The settings
    route refuses either in one shape, naming the field, so the ceiling is
    not Zod's here. */
export const UpdateSettings = Settings.partial().extend({
  nextInvoiceNumber: z.number().int().positive().optional(),
});

/** What deleting the account removes, counted so the confirm can say so. */
export const Account = z.object({
  entries: z.number().int().nonnegative(),
  clients: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  invoices: z.number().int().nonnegative(),
});

// ── billing ────────────────────────────────────────────────────────
/** The caller's plan. `available` is false until Stripe is configured. */
export const Billing = z.object({
  available: z.boolean(),
  plan: z.enum(['free', 'paid']),
  status: z.enum(SUBSCRIPTION_STATUSES).nullable(),
  periodEnd: iso.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  paymentFailed: z.boolean(),
});

/** Back from Checkout: the session the user just paid. */
export const BillingSync = z.object({
  sessionId: z.string().min(1).max(255),
});

/** Where to send the browser: Checkout or the Customer Portal. */
export const BillingRedirect = z.object({ url: z.url() });

// ── feedback ───────────────────────────────────────────────────────
/** The limits match the `feedback` table's checks. */
export const FEEDBACK_MAX = 2000;
export const CreateFeedback = z.object({
  id: uuid,
  message: z.string().trim().min(1).max(FEEDBACK_MAX),
  screen: z.string().min(1).max(200).startsWith('/'),
  client: z.enum(['web', 'macos']),
  appVersion: z.string().min(1).max(64),
});

export type Settings = z.infer<typeof Settings>;
export type Account = z.infer<typeof Account>;
export type CreateFeedback = z.infer<typeof CreateFeedback>;
export type Billing = z.infer<typeof Billing>;
export type BillingSync = z.infer<typeof BillingSync>;
export type BillingRedirect = z.infer<typeof BillingRedirect>;
