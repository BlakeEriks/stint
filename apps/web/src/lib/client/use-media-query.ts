'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches. For a breakpoint that changes
 * behaviour rather than appearance; Tailwind's `sm:` covers the rest.
 *
 * The server snapshot is `false`, so a caller renders as "does not match" for
 * one paint and then adjusts.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
