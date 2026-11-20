# Research: projection days

## Holiday dates

- **Decision**: The 11 holidays in 5 U.S.C. 6103, observed by OPM's rule:
  Saturday moves to Friday, Sunday to Monday. Fixed-date holidays: Jan 1,
  Jun 19, Jul 4, Nov 11, Dec 25. Nth-weekday ones: MLK (3rd Monday of
  January), Washington's Birthday (3rd Monday of February), Memorial Day (last
  Monday of May), Labor Day (1st Monday of September), Columbus Day (2nd
  Monday of October), Thanksgiving (4th Thursday of November).
- **Rationale**: Computed, so `packages/core` stays free of I/O, and it
  never goes stale.
- **Alternatives considered**: A table of dates per year (goes stale, needs
  yearly edits); a holiday library (a dependency for 30 lines of date math).

## New Year's on a Saturday

- **Decision**: Observed on December 31 of the year before, as OPM does
  (2021-12-31, 2027-12-31). A month's holidays are its year's plus the next
  year's, filtered to the month.
- **Alternatives considered**: Skipping the shift across years: December
  would count a day the user has off.

## One list of counted days

- **Decision**: `businessDayKeysInLocalMonth(now, tz, rule)` is the only
  definition; `buildEarnedPace` reads `total` as its length and `elapsed`
  as the keys on or before today. `businessDaysInLocalMonth` goes.
- **Rationale**: The issue asks that the series and the total can't
  disagree; one list makes it structural rather than a comment.

## Field names

- **Decision**: The API keeps `businessDaysElapsed` and `businessDaysTotal`.
  The value names are `every_day`, `weekdays` and
  `weekdays_except_holidays`. (decided autonomously)
- **Rationale**: The macOS app decodes the field names; renaming them is
  churn with no user gain.

## The control

- **Decision**: A Radix Select with `DescribedSelectItem`, as the client
  form's billing schedule uses, in a new "Home" section. (decided
  autonomously)
- **Alternatives considered**: `SegmentedControl`: three long labels
  overflow it on a phone, and it has no room to say what each option does.
