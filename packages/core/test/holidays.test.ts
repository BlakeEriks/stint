import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observedFederalHolidays } from '../src/holidays.ts';

/* OPM's published calendars. 2026 moves July 4 back to Friday; 2027 moves
   two fixed dates back (June 19, December 25) and one forward (July 4), and
   observes 2028's New Year's on its own December 31, so 2028 has none. */
const OPM: [year: number, dates: string[]][] = [
  [
    2026,
    [
      '2026-01-01', // New Year's Day
      '2026-01-19', // Martin Luther King Jr. Day, third Monday
      '2026-02-16', // Washington's Birthday, third Monday
      '2026-05-25', // Memorial Day, last Monday
      '2026-06-19', // Juneteenth
      '2026-07-03', // Independence Day, Saturday observed Friday
      '2026-09-07', // Labor Day, first Monday
      '2026-10-12', // Columbus Day, second Monday
      '2026-11-11', // Veterans Day
      '2026-11-26', // Thanksgiving, fourth Thursday
      '2026-12-25', // Christmas
    ],
  ],
  [
    2027,
    [
      '2027-01-01',
      '2027-01-18',
      '2027-02-15',
      '2027-05-31', // a May with five Mondays
      '2027-06-18', // Saturday observed Friday
      '2027-07-05', // Sunday observed Monday
      '2027-09-06',
      '2027-10-11',
      '2027-11-11',
      '2027-11-25',
      '2027-12-24', // Saturday observed Friday
      '2027-12-31', // 2028's New Year's, a Saturday, observed the Friday before
    ],
  ],
  [
    2023,
    [
      '2023-01-02', // New Year's on a Sunday, observed Monday
      '2023-01-16',
      '2023-02-20',
      '2023-05-29',
      '2023-06-19',
      '2023-07-04',
      '2023-09-04',
      '2023-10-09',
      '2023-11-10', // Veterans Day on a Saturday, observed Friday
      '2023-11-23',
      '2023-12-25',
    ],
  ],
  [
    2028,
    [
      // No New Year's: a Saturday, observed on 2027-12-31.
      '2028-01-17',
      '2028-02-21',
      '2028-05-29',
      '2028-06-19',
      '2028-07-04',
      '2028-09-04',
      '2028-10-09',
      '2028-11-10', // Veterans Day on a Saturday, observed Friday
      '2028-11-23',
      '2028-12-25',
    ],
  ],
];

test('observed federal holidays match OPM for each year', () => {
  for (const [year, dates] of OPM) {
    assert.deepEqual(observedFederalHolidays(year), dates, String(year));
  }
});
