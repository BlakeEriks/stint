/**
 * Rate resolution, mirroring resolve_entry_rate() in the database.
 *
 * Precedence: entry override -> project -> client -> user default.
 *
 * This is what bills: `POST /invoices` writes the rate TypeScript computed, so
 * the preview and the issued invoice come from identical code. The SQL chain
 * feeds the home screen's rollups, and `apps/web/test/rates.test.ts` asserts
 * the two agree across every combination of the four levels.
 */

export interface RateContext {
  entryRateOverride?: number | null;
  projectRate?: number | null;
  clientRate?: number | null;
  userDefaultRate?: number | null;
}

/** Returns the applicable hourly rate, or null if none is configured anywhere. */
export function resolveRate(ctx: RateContext): number | null {
  return (
    ctx.entryRateOverride ??
    ctx.projectRate ??
    ctx.clientRate ??
    ctx.userDefaultRate ??
    null
  );
}

/** Which level supplied the rate — surfaced in the UI so it's never a mystery. */
export type RateSource = 'entry' | 'project' | 'client' | 'default' | 'none';

export function resolveRateSource(ctx: RateContext): RateSource {
  if (ctx.entryRateOverride != null) return 'entry';
  if (ctx.projectRate != null) return 'project';
  if (ctx.clientRate != null) return 'client';
  if (ctx.userDefaultRate != null) return 'default';
  return 'none';
}

/**
 * Line amount for billable seconds at a resolved rate.
 * Rounds to cents once, at the end.
 */
export function lineAmount(totalSeconds: number, hourlyRate: number): number {
  const hours = Math.max(0, totalSeconds) / 3600;
  return Math.round(hours * hourlyRate * 100) / 100;
}
