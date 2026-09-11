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

  const { data, error } = await db
    .from('payment_profiles')
    .update({ archived_at: new Date().toISOString(), is_default: false })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Payment profile not found');

  return new NextResponse(null, { status: 204 });
});
