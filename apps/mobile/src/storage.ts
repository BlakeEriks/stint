import * as SecureStore from 'expo-secure-store';
import type { Store } from './session.ts';

/** The session's home: the Keychain on iOS, Keystore-encrypted on Android.
 *  On iOS an item lands in the app's first keychain group, the one the
 *  widgets share (`app.config.ts`). */
export const secureStore: Store = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};
