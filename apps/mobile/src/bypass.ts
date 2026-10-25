import type { Store } from './session.ts';

const KEY = 'stint.vercel-bypass';

/**
 * Vercel's Protection Bypass for Automation, which a protected preview
 * deployment asks of every request. A secret never ships in a build, and a
 * preview build's install link is posted on a public PR, so the reviewer
 * types it in once (`screens/bypass-screen.tsx`) and the phone keeps it in
 * secure storage, where the next PR's build, installed over this one, finds
 * it again.
 */
export function createBypass(store: Store) {
  let value: string | null = null;
  const listeners = new Set<(value: string | null) => void>();
  return {
    async load() {
      value = await store.get(KEY);
      return value;
    },
    async save(typed: string) {
      const trimmed = typed.trim();
      if (!trimmed) throw new Error('The bypass is empty.');
      await store.set(KEY, trimmed);
      value = trimmed;
    },
    /** Vercel refused it: forget it, so the screen asks again. */
    async clear() {
      await store.delete(KEY);
      value = null;
      for (const listener of listeners) listener(null);
    },
    /** What each request sends, read at the time it is sent. */
    current: () => value,
    subscribe(listener: (value: string | null) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
