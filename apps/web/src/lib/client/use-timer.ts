'use client';

import { currentTimeZone, useTimer as useTimerWith } from '@stint/client';
import { api } from './api';

/**
 * The zone this page renders in, read once at load: a reload is what picks
 * up a move.
 *
 * Resolved the same way on both sides deliberately — timestamps reach the
 * markup formatted in this zone, so the prerender is in the deploy region's
 * zone and the browser corrects it on hydration.
 */
export const timeZone = currentTimeZone();

/** The shared timer (`@stint/client`), on the web's cookie `api`. */
export const useTimer = () => useTimerWith(api, timeZone);
