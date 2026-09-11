import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { PAYMENT_PROFILE_COLUMNS, toPaymentProfile } from '@/lib/rows';
import { uuidv7 } from '@tt/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).default('false'),
});

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListQuery);

  let query = db
    .from('payment_profiles')
    .select(PAYMENT_PROFILE_COLUMNS)
    .order('is_default', { ascending: false })
    .order('name');

  if (q.includeArchived === 'false') query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({
    paymentProfiles: (data ?? []).map((r) => toPaymentProfile(r as Record<string, any>)),
  });
});

/**
 * Every field is optional except the name. A profile is a bundle of whatever
 * a payer needs — a US contractor fills in routing + account and nothing
 * else, while an international one fills in more.
 */
export const PaymentProfileFields = z.object({
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
  currency: z.string().length(3).nullable().optional(),
  feeAllocation: z.enum(['OUR', 'SHA', 'BEN']).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const CreateProfile = PaymentProfileFields.extend({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
});

export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateProfile);

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
      if (found) return NextResponse.json(toPaymentProfile(found as Record<string, any>));
    }
    throw error;
  }

  return NextResponse.json(toPaymentProfile(data as Record<string, any>), { status: 201 });
});
