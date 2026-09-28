/**
 * The instant and zone every story renders at, so a story shows the same
 * figures today as next month. No imports: `vitest.config.mts` reads `ZONE`
 * on the Node side to pin the browser's.
 *
 * A Thursday afternoon in mid-September: the week has days behind and ahead
 * of it, the month has business days on both sides, and no DST change is
 * near.
 */
export const NOW = '2026-09-17T19:30:00.000Z';
export const ZONE = 'America/New_York';
