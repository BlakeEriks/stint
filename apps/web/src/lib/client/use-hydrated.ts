import { useSyncExternalStore } from 'react';

const never = () => () => {};

/**
 * False while React hydrates server HTML, true after (and from the start on
 * a client-side navigation).
 *
 * The server never holds the browser's kept query cache, so it renders a
 * region's loader; the browser may have restored that region's data before
 * it hydrates. Rendering what the server rendered until hydration is done
 * keeps the two in step, and the data paints the moment after.
 */
export function useHydrated() {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}
