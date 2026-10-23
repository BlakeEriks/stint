import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  SETTINGS_COLUMNS,
  toSettings,
  toColumns,
  SETTINGS_FIELDS,
} from '@/lib/rows';
import { NEXT_INVOICE_NUMBER_MAX, UpdateSettings } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);

  const { data, error } = await db
    .from('user_settings')
    .select(SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  // The trigger on auth.users creates this row; if it is somehow missing,
  // create it rather than failing the caller.
  if (!data) {
    const { data: created, error: insertError } = await db
      .from('user_settings')
      .insert({ user_id: userId })
      .select(SETTINGS_COLUMNS)
      .single();
    if (insertError) throw insertError;
    return NextResponse.json(toSettings(created));
  }

  return NextResponse.json(toSettings(data));
});

export const PATCH = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const patch = await parseBody(req, UpdateSettings);

  const next = patch.nextInvoiceNumber;
  if (next !== undefined && next > NEXT_INVOICE_NUMBER_MAX) {
    throw await refusal(
      db,
      `The next number can't go above ${NEXT_INVOICE_NUMBER_MAX}.`,
    );
  }

  const update = toColumns(patch, SETTINGS_FIELDS);
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  let query = db.from('user_settings').update(update).eq('user_id', userId);
  /* Forward only, in the update itself: a check before it could pass just
     as an invoice takes the number. Going back would reissue a number a
     client may already have; `invoice_number_unique_per_user` refuses that
     too, but only at Generate. */
  if (next !== undefined) query = query.lte('next_invoice_number', next);

  const { data, error } = await query.select(SETTINGS_COLUMNS).maybeSingle();

  if (error) throw error;
  if (!data) {
    throw next === undefined
      ? new ApiError('ENTRY_NOT_FOUND', 'Settings not found')
      : await refusal(
          db,
          (current) =>
            `The next number can't go below ${current}, or an invoice could repeat a number already sent.`,
        );
  }

  return NextResponse.json(toSettings(data));
});

/** A refused `nextInvoiceNumber`, naming the field and the number it
    stays at, so the form can say why there and show that number again. */
async function refusal(
  db: Awaited<ReturnType<typeof requireSession>>['db'],
  message: string | ((current: number) => string),
) {
  const { data, error } = await db
    .from('user_settings')
    .select('next_invoice_number')
    .maybeSingle();
  if (error) throw error;
  if (!data) return new ApiError('ENTRY_NOT_FOUND', 'Settings not found');
  const current = data.next_invoice_number;
  return new ApiError(
    'VALIDATION_FAILED',
    typeof message === 'string' ? message : message(current),
    { field: 'nextInvoiceNumber', current },
  );
}
