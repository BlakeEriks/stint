import { DOCK_FOLD_KEY } from '@/lib/theme-script';

/**
 * Folds the dock to its strip at `xl`, or unfolds it, on every screen: no
 * screen folds it on its own. The choice is a device preference, like the
 * dock split and the zoom, so it lives in `localStorage`.
 *
 * It is `data-dock-folded` on `<html>`, which `DOCK_FOLD_SCRIPT` stamps
 * before first paint and the frame's CSS reads, so a folded dock never paints
 * open first.
 */
export function setDockFolded(folded: boolean) {
  document.documentElement.toggleAttribute('data-dock-folded', folded);
  try {
    if (folded) localStorage.setItem(DOCK_FOLD_KEY, '1');
    else localStorage.removeItem(DOCK_FOLD_KEY);
  } catch {
    /* Private mode: the choice lasts until the next page load. */
  }
}
