import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { MarkInvoicedElsewhere } from '@stint/schema';
import { markable } from '@/lib/invoiced-elsewhere';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/entries/invoiced-elsewhere
 *
 * Marks, or clears, work billed from another tool. Only the ids the user
 * pressed on change (Constitution I), and a mark skips any not `markable`.
 */
export const POST = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { ids, invoicedElsewhere } = await parseBody(
    req,
    MarkInvoicedElsewhere,
  );

  const q = db
    .from('time_entries')
    .update({ invoiced_elsewhere: invoicedElsewhere })
    .in('id', ids)
    .eq('invoiced_elsewhere', !invoicedElsewhere);
  const { data, error } = await (invoicedElsewhere ? markable(q) : q).select(
    'id',
  );
  if (error) throw error;

  return NextResponse.json({ ids: (data ?? []).map((r) => r.id as string) });
});
