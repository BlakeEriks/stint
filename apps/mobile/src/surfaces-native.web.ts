import type { Backend, SurfaceState } from './surfaces.ts';

/** The web render has no notification, widget, tile or shortcut. */
export const canDraw = false;
export function drawSurfaces(_state: SurfaceState, _backend: Backend) {}
export const onPressedOutside = (_listener: () => void) => () => {};
export const notifications = {
  read: async () => null,
  ask: async () => ({ granted: false, canAskAgain: false }),
};
