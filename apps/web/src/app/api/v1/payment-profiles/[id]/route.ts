import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  PAYMENT_PROFILE_COLUMNS,
  toPaymentProfile,
  toColumns,
  PAYMENT_PROFILE_FIELDS,
} from '@/lib/rows';
import { PaymentProfileFields } from '../route';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const UpdateProfile = PaymentProfileFields.extend({
  name: z.string().trim().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');

  return NextResponse.json(toPaymentProfile(data as Record<string, any>));
});

/**
 * PATCH /api/v1/payment-profiles/:id
 *
 * Editing a profile never touches an already-issued invoice: those carry a
 * frozen snapshot. Only future invoices see the change.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const patch = await parseBody(req, UpdateProfile);

  const update = toColumns(patch, PAYMENT_PROFILE_FIELDS);
  if (patch.archived !== undefined) {
    update.archived_at = patch.archived ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  // One default per user is a partial unique index; clear the old one first
  // so the update does not collide with it.
  if (patch.isDefault === true) {
    const { error: clearError } = await db
      .from('payment_profiles')
      .update({ is_default: false })
      .eq('is_default', true)
      .neq('id', id);
    if (clearError) throw clearError;
  }

  /* Demoting the only profile would leave the user with no default, and
     `loadPaymentProfile` then resolves to null — so the next invoice renders
     with no bank details and nothing says why. The index stops two defaults;
     nothing stopped zero. Creation guarantees the first profile is the
     default, and this keeps that true after an edit. */
  if (patch.isDefault === false) {
    const { data: others, error: othersError } = await db
      .from('payment_profiles')
      .select('id')
      .is('archived_at', null)
      .neq('id', id);
    if (othersError) throw othersError;
    if ((others ?? []).length === 0) {
      delete update.is_default;
      // `is_default: false` may have been the only field, and an update with
      // no columns is not a request to reject — it is one already satisfied.
      if (Object.keys(update).length === 0) {
        const { data: unchanged, error: readError } = await db
          .from('payment_profiles')
          .select(PAYMENT_PROFILE_COLUMNS)
          .eq('id', id)
          .maybeSingle();
        if (readError) throw readError;
        if (!unchanged)
          throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');
        return NextResponse.json(
          toPaymentProfile(unchanged as Record<string, any>),
        );
      }
    }
  }

  const { data, error } = await db
    .from('payment_profiles')
    .update(update)
    .eq('id', id)
    .select(PAYMENT_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');

  return NextResponse.json(toPaymentProfile(data as Record<string, any>));
});

/**
 * Archives rather than deletes. Clients may reference the profile, and
 * archiving keeps the row resolvable rather than silently orphaning them.
 */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  /* Read the flag BEFORE archiving: `returning` hands back the updated row,
     where `is_default` has already been cleared, so asking afterwards would
     say "not the default" every time and promote nobody. */
  const { data: before, error: beforeError } = await db
    .from('payment_profiles')
    .select('id, is_default')
    .eq('id', id)
    .maybeSingle();
  if (beforeError) throw beforeError;
  if (!before)
    throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');

  const { data, error } = await db
    .from('payment_profiles')
    .update({ archived_at: new Date().toISOString(), is_default: false })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');

  /* Archiving the default cleared the flag and stopped there, so a user with
     other live profiles was left with none of them default — and resolution
     falls through to null, putting an invoice out with no bank details. The
     default moves to a survivor rather than evaporating. */
  if ((before as Record<string, any>).is_default) {
    const { data: survivors, error: survivorError } = await db
      .from('payment_profiles')
      .select('id')
      .is('archived_at', null)
      .order('name');
    if (survivorError) throw survivorError;

    const heir = (survivors ?? [])[0] as { id: string } | undefined;
    if (heir) {
      const { error: promoteError } = await db
        .from('payment_profiles')
        .update({ is_default: true })
        .eq('id', heir.id);
      if (promoteError) throw promoteError;
    }
  }

  return new NextResponse(null, { status: 204 });
});
