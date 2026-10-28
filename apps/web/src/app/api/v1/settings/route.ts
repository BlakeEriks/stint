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
    return NextResponse.json(toSettings(created, await highestInvoice(db)));
  }

  return NextResponse.json(toSettings(data, await highestInvoice(db)));
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

  const update: Record<string, unknown> = toColumns(patch, SETTINGS_FIELDS);
  // Saving terms answers the Inbox's question about the old text.
  if (patch.paymentTermsDays !== undefined) update.legacy_payment_terms = null;
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  for (;;) {
    const saved = await save(db, userId, update, next);
    if (saved) {
      return NextResponse.json(toSettings(saved, await highestInvoice(db)));
    }
  }
});

type Db = Awaited<ReturnType<typeof requireSession>>['db'];

/** The saved settings, or null when an invoice took a number between the
    check and the write, so the caller checks again. */
async function save(
  db: Db,
  userId: string,
  update: Record<string, unknown>,
  next: number | undefined,
) {
  let query = db.from('user_settings').update(update).eq('user_id', userId);
  if (next !== undefined) {
    // Read before the invoices: an invoice taken after this read moves it.
    const current = await currentNumber(db);
    const highest = await highestInvoice(db);
    if (highest && next <= highest.sequence_no) {
      throw await refusal(
        db,
        `${highest.invoice_number} is already used. Pick ${highest.sequence_no + 1} or higher.`,
      );
    }
    /* Only if no invoice took a number since the read; otherwise the
       counter could be set to the number it just gave out. */
    query = query.eq('next_invoice_number', current);
  }

  const { data, error } = await query.select(SETTINGS_COLUMNS).maybeSingle();
  if (error) throw error;
  if (data) return data;
  if (next === undefined) {
    throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');
  }
  return null;
}

/** The invoice holding the highest number, drafts included: the next
    number must pass it, or the counter steps into a number already used. */
async function highestInvoice(db: Db) {
  const { data, error } = await db
    .from('invoices')
    .select('sequence_no, invoice_number')
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function currentNumber(db: Db) {
  const { data, error } = await db
    .from('user_settings')
    .select('next_invoice_number')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');
  return data.next_invoice_number;
}

/** A refused `nextInvoiceNumber`, naming the field and the number it
    stays at, so the form can say why there and show that number again. */
async function refusal(db: Db, message: string) {
  return new ApiError('VALIDATION_FAILED', message, {
    field: 'nextInvoiceNumber',
    current: await currentNumber(db),
  });
}
