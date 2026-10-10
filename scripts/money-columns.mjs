// A money column is found by name, so a new one is checked without editing a
// list.
const MONEY =
  /(^|_)(amount|total|subtotal|price)$|hourly_rate$|^rate_override$/;
const FLOAT = new Set(['real', 'double precision']);

/**
 * Rows from `information_schema.columns` in, one message per column that
 * breaks the rule out: money is `numeric(12,2)` and nothing is a float.
 */
export function moneyColumnProblems(columns) {
  const problems = [];
  for (const c of columns) {
    const name = `${c.table_name}.${c.column_name}`;
    if (FLOAT.has(c.data_type)) {
      problems.push(
        `${name} is ${c.data_type}; a float cannot hold cents exactly.`,
      );
    } else if (
      MONEY.test(c.column_name) &&
      !(
        c.data_type === 'numeric' &&
        c.numeric_precision === 12 &&
        c.numeric_scale === 2
      )
    ) {
      const type =
        c.data_type === 'numeric'
          ? `numeric(${c.numeric_precision},${c.numeric_scale})`
          : c.data_type;
      problems.push(`${name} is ${type}; money is numeric(12,2).`);
    }
  }
  return problems;
}
