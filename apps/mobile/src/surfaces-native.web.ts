import type { SurfaceState } from './surfaces.ts';

/** The web render has no notification, widget, tile or shortcut. */
export const canDraw = false;
export function drawSurfaces(_state: SurfaceState) {}
export const notifications = {
  read: async () => null,
  ask: async () => ({ granted: false, canAskAgain: false }),
};
