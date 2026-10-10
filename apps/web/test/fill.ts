import type pg from 'pg';

/**
 * `n` stopped entries of `minutes` each, a minute apart, the first at `from`:
 * enough rows to pass PostgREST's 1,000-row `max_rows`, which the shim caps
 * a select at too.
 */
export async function fill(
  pool: pg.Pool,
  opts: {
    userId: string;
    projectId: string | null;
    from: string;
    n: number;
    minutes?: number;
  },
) {
  const { userId, projectId, from, n, minutes = 1 } = opts;
  await pool.query(
    `insert into time_entries (id,user_id,project_id,task_name,started_at,ended_at)
     select gen_random_uuid(), $1, $2, 'Work',
            $3::timestamptz + (i * ($5::int + 1) * interval '1 minute'),
            $3::timestamptz + (i * ($5::int + 1) + $5) * interval '1 minute'
     from generate_series(0, $4 - 1) i`,
    [userId, projectId, from, n, minutes],
  );
}
