/** PostgREST's `max_rows` (`supabase/config.toml`, and Supabase's default). */
const PAGE_SIZE = 1000;

/**
 * Every row a read matches. PostgREST answers one read with at most
 * `max_rows` rows and says nothing of the rest, so a read that can match
 * more pages through `.range()` until a page comes back short.
 *
 * `page` builds the read afresh for each page, because a supabase-js builder
 * is spent once awaited. Its order must be total — end on a unique column —
 * or rows tied on the sort can repeat or vanish across pages.
 */
export async function selectAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}
