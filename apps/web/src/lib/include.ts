import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { IncludeQuery, type Included, type IncludedName } from '@stint/schema';
import { parseQuery } from './validate';
import { readStats } from './stats';
import { readSummary } from './summary';

type Asked = z.infer<typeof IncludeQuery>;

/**
 * What a write's `?include=` asks for. Parsed before the write, so a bad
 * name is a 422 that changed nothing.
 */
export function askedToInclude(req: Request): Asked {
  return parseQuery(req, IncludeQuery);
}

const READS: Record<
  IncludedName,
  (db: SupabaseClient, userId: string, tz: string) => Promise<unknown>
> = {
  summary: (db, _userId, tz) => readSummary(db, tz),
  stats: readStats,
};

/**
 * The reads `asked` names, taken after the write so they count it. Null when
 * it named none: the response is then the route's plain shape.
 */
export async function readIncluded(
  asked: Asked,
  db: SupabaseClient,
  userId: string,
): Promise<Included | null> {
  if (!asked.include?.length) return null;
  const names = [...new Set(asked.include)];
  const reads = await Promise.all(
    names.map(async (name) => [name, await READS[name](db, userId, asked.tz)]),
  );
  return Object.fromEntries(reads);
}

/** A start's or entry `PATCH`'s body: the bare record, unless it included. */
export function entryWith<T>(entry: T, included: Included | null) {
  return included ? { entry, included } : entry;
}
