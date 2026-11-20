import { appNow } from '@stint/client';
import { useHydrated } from './use-hydrated';

/**
 * The app's now, or null while the server renders and React hydrates.
 *
 * Every page is prerendered at build, and Cache Components refuses a render
 * that reads the clock there: the HTML would show the day the build ran. A
 * screen paints its dates the moment after hydration instead, and from the
 * start on a client-side switch.
 */
export function useNow(): Date | null {
  return useHydrated() ? appNow() : null;
}
