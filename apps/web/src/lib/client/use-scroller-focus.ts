'use client';

import { useMediaQuery } from './use-media-query';

/** Tailwind's `xl`, where the shell's columns stop growing and scroll themselves. */
export const XL = '(width >= 80rem)';

/**
 * The `tabIndex` for a region that scrolls itself: `0` while `query` matches.
 * A focusable scroller is one Safari's keyboard can scroll, and the stories'
 * a11y check fails one without it (`scrollable-region-focusable`). Where the
 * query does not match the page scrolls instead, and a focusable region would
 * be an idle tab stop. `'all'` is for a region that may scroll at any width.
 */
export function useScrollerFocus(query: string = XL): 0 | undefined {
  return useMediaQuery(query) ? 0 : undefined;
}
