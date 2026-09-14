import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  PAYMENT_PROFILE_COLUMNS,
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
      id: body.id ?? uuidv7(),
      user_id: userId,
      name: body.name,
      is_default: isDefault,
      account_holder_name: body.accountHolderName ?? null,
      account_holder_address: body.accountHolderAddress ?? null,
      bank_name: body.bankName ?? null,
      bank_address: body.bankAddress ?? null,
      account_number: body.accountNumber ?? null,
      routing_number: body.routingNumber ?? null,
      account_type: body.accountType ?? null,
      iban: body.iban ?? null,
      swift_bic: body.swiftBic ?? null,
      local_code_label: body.localCodeLabel ?? null,
      local_code: body.localCode ?? null,
      intermediary_bank_name: body.intermediaryBankName ?? null,
      intermediary_swift_bic: body.intermediarySwiftBic ?? null,
      intermediary_account_number: body.intermediaryAccountNumber ?? null,
      payment_link_label: body.paymentLinkLabel ?? null,
      payment_link_url: body.paymentLinkUrl ?? null,
      currency: body.currency ?? null,
      fee_allocation: body.feeAllocation ?? null,
      notes: body.notes ?? null,
    })
    .select(PAYMENT_PROFILE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505' && body.id) {
      const { data: found } = await db
        .from('payment_profiles')
        .select(PAYMENT_PROFILE_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (found)
        return NextResponse.json(toPaymentProfile(found as PaymentProfileRow));
    }
    throw error;
  }

  return NextResponse.json(toPaymentProfile(data as PaymentProfileRow), {
    status: 201,
  });
});
