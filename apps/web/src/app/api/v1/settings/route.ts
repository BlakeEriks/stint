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
import { UpdateSettings } from '@stint/schema';

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

  const update = toColumns(patch, SETTINGS_FIELDS);
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  const { data, error } = await db
    .from('user_settings')
    .update(update)
    .eq('user_id', userId)
    .select(SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Settings not found');

  return NextResponse.json(toSettings(data));
});
