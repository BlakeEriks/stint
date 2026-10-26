import type { Store } from './session.ts';

/** The web render's store, which only builders use (`docs/mobile.md`). */
export const secureStore: Store = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  delete: async (key) => localStorage.removeItem(key),
};
