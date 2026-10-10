import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moneyColumnProblems } from './money-columns.mjs';

const col = (column_name, data_type, precision, scale) => ({
  table_name: 't',
  column_name,
  data_type,
  numeric_precision: precision,
  numeric_scale: scale,
});

test('money and non-money numeric columns as the schema has them pass', () => {
  assert.deepEqual(
    moneyColumnProblems([
      col('hourly_rate', 'numeric', 12, 2),
      col('rate_override', 'numeric', 12, 2),
      col('amount', 'numeric', 12, 2),
      col('unit_price', 'numeric', 12, 2),
      col('expenses_subtotal', 'numeric', 12, 2),
      col('total', 'numeric', 12, 2),
      col('tax_amount', 'numeric', 12, 2),
      col('tax_rate', 'numeric', 5, 2),
      col('quantity', 'numeric', 12, 2),
      col('max_timer_hours', 'numeric', 4, 1),
      col('sequence_no', 'integer', 32, 0),
      col('total_seconds', 'integer', 32, 0),
      col('default_hourly_rate', 'numeric', 12, 2),
    ]),
    [],
  );
});

test('a money column at another precision or scale fails', () => {
  assert.equal(moneyColumnProblems([col('total', 'numeric', 10, 2)]).length, 1);
  assert.equal(
    moneyColumnProblems([col('hourly_rate', 'numeric', 12, 4)]).length,
    1,
  );
});

test('a money column of another type fails', () => {
  assert.equal(
    moneyColumnProblems([col('amount', 'integer', 32, 0)]).length,
    1,
  );
});

test('a float column fails whatever its name', () => {
  assert.equal(moneyColumnProblems([col('ratio', 'real', 24, null)]).length, 1);
  assert.equal(
    moneyColumnProblems([col('amount', 'double precision', 53, null)]).length,
    1,
  );
});
