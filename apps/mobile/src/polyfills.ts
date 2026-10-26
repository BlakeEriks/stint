import { getRandomValues } from 'expo-crypto';

/* `uuidv7()` (`@stint/core`) draws from `crypto.getRandomValues`, which
   Hermes does not provide. The web render has its own. */
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...globalThis.crypto, getRandomValues },
  });
}
