import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { CLIENT_COLUMNS, toClient, toColumns, CLIENT_FIELDS } from '@/lib/rows';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const UpdateClient = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.email().nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  archived: z.boolean().optional(),
});

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Client not found');

  return NextResponse.json(toClient(data));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const patch = await parseBody(req, UpdateClient);

  const update = toColumns(patch, CLIENT_FIELDS);
  if (patch.archived !== undefined) {
    update.archived_at = patch.archived ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  const { data, error } = await db
    .from('clients')
    .update(update)
    .eq('id', id)
    .select(CLIENT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Client not found');

  return NextResponse.json(toClient(data));
});

/**
 * Archives rather than deletes. Issued invoices reference this row, and a
 * financial record must not lose the name it was billed to.
 */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('clients')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Client not found');

  return new NextResponse(null, { status: 204 });
});
