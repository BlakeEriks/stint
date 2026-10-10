import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  PAYMENT_PROFILE_COLUMNS,
  PAYMENT_PROFILE_FIELDS,
  toPaymentProfile,
  type PaymentProfileRow,
} from '@/lib/rows';
import { uuidv7 } from '@stint/core';
import { CreatePaymentProfile, ListPaymentProfilesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListPaymentProfilesQuery);

  let query = db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .order('is_default', { ascending: false })
    .order('name');

  if (!q.includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({
    paymentProfiles: (data ?? []).map((r) =>
      toPaymentProfile(r as PaymentProfileRow),
    ),
  });
});

export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreatePaymentProfile);

  const { data: existing, error: countError } = await db
    .from('payment_profiles')
    .select('id')
    .is('archived_at', null);
  if (countError) throw countError;

  // The first profile is the default regardless — otherwise a user who
  // never ticks the box gets invoices with no payment details.
  const isDefault = body.isDefault || (existing ?? []).length === 0;

  // A partial unique index enforces one default; clear the old one first.
  if (isDefault) {
    const { error: clearError } = await db
      .from('payment_profiles')
      .update({ is_default: false })
      .eq('is_default', true);
    if (clearError) throw clearError;
  }

  const { data, error } = await db
    .from('payment_profiles')
    .insert({
      ...insertColumns(body),
      id: body.id ?? uuidv7(),
      user_id: userId,
      is_default: isDefault,
    })
    .select(PAYMENT_PROFILE_COLUMNS)
    .single();

  if (error) {
    const found =
      error.code === '23505' && body.id
        ? await existingOnRetry(db, body.id)
        : null;
    if (found) return NextResponse.json(found);
    throw error;
  }

  return NextResponse.json(toPaymentProfile(data as PaymentProfileRow), {
    status: 201,
  });
});

/** Every detail column, `null` where the body omits it. */
function insertColumns(body: Record<string, unknown>) {
  const columns: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(PAYMENT_PROFILE_FIELDS)) {
    columns[column] = body[field] ?? null;
  }
  return columns;
}

/** The row a retried create already wrote, or `null` if the id is not ours. */
async function existingOnRetry(db: SupabaseClient, id: string) {
  const { data } = await db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return data ? toPaymentProfile(data as PaymentProfileRow) : null;
}
