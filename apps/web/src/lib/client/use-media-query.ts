'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * **Reach for Tailwind's `sm:` first.** This exists for the rarer case where a
 * breakpoint changes BEHAVIOUR rather than appearance and CSS therefore cannot
 * express it — the calendar's arrows step one day on a phone and one week on a
 * desktop, which is a different action, not a different style.
 *
 * `useSyncExternalStore` rather than `useEffect` + `useState`: it subscribes
 * and reads in one place, so there is no first paint with a stale value and no
 * tearing under concurrent rendering.
 *
 * **The server snapshot is `false`**, because the server has no viewport. A
 * component using this must render correctly as "does not match" for one
 * paint, then adjust — the same constraint as the theme script, and the reason
 * the calendar's mobile view is a lens over week data rather than a separate
 * fetch: switching lenses needs no new request.
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
