import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import type { Account } from '@stint/schema';

export const dynamic = 'force-dynamic';

const TABLES = {
  entries: 'time_entries',
  clients: 'clients',
  projects: 'projects',
  invoices: 'invoices',
} as const;

/** What deleting the account would remove, archived rows included. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);

  const counts = await Promise.all(
    Object.entries(TABLES).map(async ([key, table]) => {
      const { count, error } = await db
        .from(table)
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return [key, count ?? 0] as const;
    }),
  );

  return NextResponse.json(Object.fromEntries(counts) as Account);
});

/** Deletes the caller and everything they own — one transaction, no undo. */
export const DELETE = handle(async (req: Request) => {
  const { db } = await requireSession(req);

  const { error } = await db.rpc('delete_account');
  if (error) throw error;

  return new NextResponse(null, { status: 204 });
});
