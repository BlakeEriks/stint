import { z } from 'zod';
import { InvoiceStatus } from './invoicing.ts';
import { money, uuid } from './primitives.ts';

/**
 * A cost the contractor paid that a client reimburses on the invoice. It has
 * an amount and no duration, and the amount is in the client's currency.
 */
export const Expense = z.object({
  id: uuid,
  clientId: uuid,
  /** Billed on every invoice for the client, and never attached to one. */
  recurring: z.boolean(),
  /** Null exactly when recurring: its line takes the period's last day. */
  spentOn: z.iso.date().nullable(),
  description: z.string(),
  amount: money,
  /** A receipt or order number. Never printed on the invoice. */
  note: z.string().nullable(),
  /** Set means billed. */
  invoiceId: uuid.nullable(),
  /** The billing invoice's number and status, so a list can say where an
   *  expense went and whether it can still change. Null while unbilled. */
  invoiceNumber: z.string().nullable(),
  invoiceStatus: InvoiceStatus.nullable(),
});

const expenseAmount = money.refine((n) => n > 0, {
  message: 'an expense is more than zero',
});

/** A one-off has the day it was paid; a recurring expense has none. */
const datedUnlessRecurring = (e: {
  recurring?: boolean;
  spentOn?: string | null;
}) => (e.recurring ?? false) === (e.spentOn == null);

/** The id is client-supplied (UUIDv7) so a retry is idempotent. */
export const CreateExpense = z
  .object({
    id: uuid,
    clientId: uuid,
    recurring: z.boolean().default(false),
    spentOn: z.iso.date().nullable().optional(),
    description: z.string().trim().min(1).max(200),
    amount: expenseAmount,
    note: z.string().max(500).nullable().optional(),
  })
  .refine(datedUnlessRecurring, {
    message: 'a one-off expense has a date and a recurring one has none',
    path: ['spentOn'],
  });

/** Checked against the stored row in the route: `recurring: true` clears the
 *  date, and `false` needs one. */
export const UpdateExpense = z
  .object({
    recurring: z.boolean(),
    spentOn: z.iso.date().nullable(),
    description: z.string().trim().min(1).max(200),
    amount: expenseAmount,
    note: z.string().max(500).nullable(),
  })
  .partial();

export const ListExpensesQuery = z.object({
  clientId: uuid.optional(),
  /** `open` is what a client card lists: recurring, unbilled, and on an
   *  invoice not yet paid. `unbilled` is what an invoice can take. */
  status: z.enum(['open', 'unbilled']).default('open'),
});

export type Expense = z.infer<typeof Expense>;
