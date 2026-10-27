/**
 * The API contract, one file per resource. Single source of truth.
 *
 * Web and Expo import these directly. The macOS Swift client can't: its
 * hand-written models decode responses the route suite records
 * (`ContractTests.swift`).
 */

export * from './clients.ts';
export * from './entries.ts';
export * from './errors.ts';
export * from './expenses.ts';
export * from './invoicing.ts';
export * from './payment-profiles.ts';
export {
  currency,
  iso,
  money,
  timeZone,
  timeZoneStrict,
  uuid,
} from './primitives.ts';
export * from './settings.ts';
export * from './stats.ts';
