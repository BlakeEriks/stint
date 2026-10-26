import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type { Store } from './session.ts';

/* An iOS keychain access group shared with the widgets and extensions, once
   the Apple team exists: its id prefixes the group. Android's widgets run in
   the app's own process and read the same store. */
const team = Constants.expoConfig?.extra?.appleTeamId as string | undefined;
const options: SecureStore.SecureStoreOptions = team
  ? { accessGroup: `${team}.dev.stint.shared` }
  : {};

/** The session's home: the Keychain on iOS, Keystore-encrypted on Android. */
export const secureStore: Store = {
  get: (key) => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  delete: (key) => SecureStore.deleteItemAsync(key, options),
};
