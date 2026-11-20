import { z } from 'zod';
import { iso, uuid } from './primitives.ts';

/** Who an invoice is from: its From block. Several when the user bills
 *  through more than one entity, as payment profiles are several. */
export const BusinessProfile = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(200),
  /** Null only on a business made from old Settings without one; an invoice
   *  refuses it until one is added. */
  email: z.email().nullable(),
  address: z.string().max(1000).nullable(),
  logoUrl: z.url().nullable(),
  isDefault: z.boolean(),
  archivedAt: iso.nullable(),
});

export const CreateBusinessProfile = BusinessProfile.omit({
  id: true,
  isDefault: true,
  archivedAt: true,
}).extend({
  id: uuid.optional(),
  email: z.email(),
  address: z.string().max(1000).nullable().optional(),
  logoUrl: z.url().nullable().optional(),
  isDefault: z.boolean().default(false),
});

/* `isDefault` re-declared, as `UpdatePaymentProfile` does: `.partial()`
   keeps the create schema's default, so any other PATCH would demote. */
export const UpdateBusinessProfile = CreateBusinessProfile.partial()
  .omit({ id: true })
  .extend({
    isDefault: z.boolean().optional(),
    archived: z.boolean().optional(),
  });

export type BusinessProfile = z.infer<typeof BusinessProfile>;
