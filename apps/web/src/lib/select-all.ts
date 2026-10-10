/** PostgREST's `max_rows` (`supabase/config.toml`, and Supabase's default). */
const PAGE_SIZE = 1000;

/** A filtered, sorted read, before `selectAll` pages it. */
type Read<T> = {
  order(
    column: 'id',
    options: { ascending: true },
  ): {
    range(
      from: number,
      to: number,
    ): PromiseLike<{ data: T[] | null; error: unknown }>;
  };
};

/**
 * Every row a read matches. PostgREST answers one read with at most
 * `max_rows` rows and says nothing of the rest, so this pages through
 * `.range()` until a page comes back short.
 *
 * `read` builds the read afresh for each page, because a supabase-js builder
 * is spent once awaited. The `id` appended last makes the order total, so no
 * row tied on the caller's sort repeats or vanishes across pages.
 */
export async function selectAll<T>(read: () => Read<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read()
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}
