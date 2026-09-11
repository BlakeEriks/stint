// A minimal supabase-js-shaped query builder over node-postgres.
// Exercises the REAL route handlers against the REAL schema, including
// triggers and the partial unique index. Only the transport differs.
import pg from 'pg';

export function makeDb(pool, userId) {
  const run = async (sql, params) => {
    try {
      const r = await pool.query(sql, params);
      return { rows: r.rows, error: null };
    } catch (e) {
      return { rows: [], error: { code: e.code, message: e.message } };
    }
  };

  function from(table) {
    // Where-clauses are stored as (builder) thunks and numbered only in
    // _exec, so SET and WHERE placeholders can never collide regardless of
    // the order the builder methods were called in.
    const st = { table, cols: '*', wheres: [], params: [], order: null, lim: null,
                 op: 'select', payload: null };

    const api = {
      select(cols) { st.cols = cols || '*'; return api; },
      insert(obj) { st.op = 'insert'; st.payload = obj; return api; },
      update(obj) { st.op = 'update'; st.payload = obj; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(c, v) { st.wheres.push((P) => `${c} = ${P(v)}`); return api; },
      is(c, v) { st.wheres.push(() => `${c} IS ${v === null ? 'NULL' : v}`); return api; },
      not(c, _op, v) { st.wheres.push(() => `${c} IS NOT ${v === null ? 'NULL' : v}`); return api; },
      gte(c, v) { st.wheres.push((P) => `${c} >= ${P(v)}`); return api; },
      lte(c, v) { st.wheres.push((P) => `${c} <= ${P(v)}`); return api; },
      in(c, vs) {
        if (!vs.length) { st.wheres.push(() => 'false'); return api; }
        st.wheres.push((P) => `${c} = ANY(${P(vs)})`); return api;
      },
      order(c, o) { st.order = `${c} ${o?.ascending === false ? 'DESC' : 'ASC'}`; return api; },
      limit(n) { st.lim = n; return api; },

      async _exec() {
        const P = (v) => { st.params.push(v); return `$${st.params.length}`; };
        const whereSql = () => [`user_id = ${P(userId)}`, ...st.wheres.map((w) => w(P))].join(' AND ');
        let sql;
        if (st.op === 'insert') {
          // No WHERE clause on an insert — adding the user scope here would
          // leave an unused placeholder and break parameter inference.
          const keys = Object.keys(st.payload);
          const vals = keys.map((k) => P(st.payload[k]));
          sql = `insert into ${st.table} (${keys.join(',')}) values (${vals.join(',')}) returning ${st.cols}`;
        } else if (st.op === 'update') {
          // SET placeholders must be numbered before the WHERE ones.
          const sets = Object.keys(st.payload).map((k) => `${k} = ${P(st.payload[k])}`);
          sql = `update ${st.table} set ${sets.join(',')} where ${whereSql()} returning ${st.cols}`;
        } else if (st.op === 'delete') {
          sql = `delete from ${st.table} where ${whereSql()} returning ${st.cols}`;
        } else {
          sql = `select ${st.cols} from ${st.table} where ${whereSql()}`;
          if (st.order) sql += ` order by ${st.order}`;
          if (st.lim) sql += ` limit ${st.lim}`;
        }
        return run(sql, st.params);
      },
      async single() {
        const { rows, error } = await api._exec();
        if (error) return { data: null, error };
        return { data: rows[0] ?? null, error: rows.length ? null : { code: 'PGRST116', message: 'no rows' } };
      },
      async maybeSingle() {
        const { rows, error } = await api._exec();
        return { data: rows[0] ?? null, error };
      },
      then(res, rej) { return api._exec().then(({ rows, error }) => ({ data: rows, error })).then(res, rej); },
    };
    return api;
  }

  return { from, auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } };
}
