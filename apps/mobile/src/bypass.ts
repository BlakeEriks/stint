import { createListeners } from './listeners.ts';
import type { Store } from './session.ts';

const KEY = 'stint.vercel-bypass';

/**
 * Vercel's Protection Bypass for Automation, which a protected preview
 * deployment asks of every request. A secret never ships in a build or an
 * update, and their links are posted on public PRs, so the reviewer types it
 * in once (`screens/bypass-screen.tsx`) and the phone keeps it in secure
 * storage, where every PR opened in this install finds it again.
 */
export function createBypass(store: Store) {
  let value: string | null = null;
  const listeners = createListeners<string | null>();
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
      listeners.emit(null);
    },
    /** What each request sends, read at the time it is sent. */
    current: () => value,
    subscribe: listeners.subscribe,
  };
}
