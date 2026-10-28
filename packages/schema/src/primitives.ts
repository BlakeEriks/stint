import { PAYMENT_TERMS_MAX_DAYS, isValidTimeZone } from '@stint/core';
import { z } from 'zod';

export const uuid = z.uuid();
export const iso = z.iso.datetime({ offset: true });
export const money = z.number().nonnegative().multipleOf(0.01);
export const currency = z.string().length(3);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * An IANA zone. "Today" and "September" are local-calendar questions the
 * server cannot infer, so the client states the zone.
 *
 * `catch` rather than a hard failure on the read endpoints: a view that
 * renders in UTC beats a view that does not render. The write endpoints, and
 * the reads that derive a draft, reject one instead, because a zone that
 * silently becomes UTC decides which entries land on an invoice.
 */
export const timeZone = z.string().refine(isValidTimeZone).catch('UTC');
export const ianaZone = z
  .string()
  .refine(isValidTimeZone, { message: 'not an IANA time zone' });
export const timeZoneStrict = ianaZone.default('UTC');

/** Whole days from issue to due; 0 is due on receipt. */
export const termsDays = z.number().int().min(0).max(PAYMENT_TERMS_MAX_DAYS);

/** Query parameters arrive as strings; a flag is spelled out either way. */
export const boolParam = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
