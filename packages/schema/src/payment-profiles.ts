import { validateRoutingNumber } from '@stint/core';
import { z } from 'zod';
import { boolParam, currency, iso, uuid } from './primitives.ts';

// US-first: account + ACH routing is the default path, everything else
// is additive and renders only when populated.
export const PaymentProfile = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean(),

  accountHolderName: z.string().max(200).nullable().optional(),
  accountHolderAddress: z.string().max(1000).nullable().optional(),
  bankName: z.string().max(200).nullable().optional(),
  bankAddress: z.string().max(1000).nullable().optional(),
  accountNumber: z.string().max(64).nullable().optional(),
  routingNumber: z.string().max(64).nullable().optional(),
  accountType: z.enum(['checking', 'savings']).nullable().optional(),

  iban: z.string().max(64).nullable().optional(),
  swiftBic: z.string().max(16).nullable().optional(),
  localCodeLabel: z.string().max(64).nullable().optional(),
  localCode: z.string().max(64).nullable().optional(),

  intermediaryBankName: z.string().max(200).nullable().optional(),
  intermediarySwiftBic: z.string().max(16).nullable().optional(),
  intermediaryAccountNumber: z.string().max(64).nullable().optional(),

  paymentLinkLabel: z.string().max(64).nullable().optional(),
  paymentLinkUrl: z.url().nullable().optional(),

  currency: currency.nullable().optional(),
  feeAllocation: z.enum(['OUR', 'SHA', 'BEN']).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  archivedAt: iso.nullable().optional(),
});

/* Stored as its 9 digits, and refused when they fail the ABA checksum: a
   malformed number on an invoice risks a returned or misrouted ACH. The
   database holds the 9 digits too (`payment_profiles_routing_number_digits`);
   the checksum is only here. */
const routingNumber = z.string().transform((v, ctx) => {
  const digits = validateRoutingNumber(v);
  if (digits) return digits;
  ctx.addIssue({
    code: 'custom',
    message: 'Not a valid routing number: 9 digits that pass the ABA check',
  });
  return z.NEVER;
});

export const CreatePaymentProfile = PaymentProfile.omit({
  id: true,
  isDefault: true,
  archivedAt: true,
}).extend({
  id: uuid.optional(),
  isDefault: z.boolean().default(false),
  routingNumber: routingNumber.nullable().optional(),
});

/* `isDefault` is re-declared rather than inherited: `.partial()` keeps the
   create schema's `.default(false)`, so a PATCH of any other field would parse
   as a demotion and silently strip the user's default. */
export const UpdatePaymentProfile = CreatePaymentProfile.partial()
  .omit({ id: true })
  .extend({
    isDefault: z.boolean().optional(),
    archived: z.boolean().optional(),
  });

export const ListPaymentProfilesQuery = z.object({
  includeArchived: boolParam,
});

export type PaymentProfile = z.infer<typeof PaymentProfile>;
