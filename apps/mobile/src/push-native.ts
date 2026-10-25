import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import {
  isTimerPush,
  type PushTokens,
  TokenUnavailable,
  tokenUnavailable,
} from './push.ts';

const TASK = 'stint-timer-push';

/** Android with Firebase configured at build time (`app.config.ts`). A build
 *  without it has no Firebase app to ask for a token. */
export const canPush =
  Platform.OS === 'android' && Constants.expoConfig?.extra?.push === true;

/** FCM's token for this phone, raw: the server sends to FCM, not Expo's service. */
export const expoTokens: PushTokens = {
  async get() {
    try {
      return (await Notifications.getDevicePushTokenAsync()).data as string;
    } catch (err) {
      if (tokenUnavailable(err)) {
        throw new TokenUnavailable((err as Error).message);
      }
      throw err;
    }
  },
  onChange(listener) {
    const sub = Notifications.addPushTokenListener((t) =>
      listener(t.data as string),
    );
    return () => sub.remove();
  },
};

/**
 * Runs `onPush` for each timer push. `expo-notifications` hands a data-only
 * message to a task, never to its foreground listener, so the task is
 * defined as the app's module loads, as its docs require; the same task
 * runs when the app is in the background.
 */
export function listenForTimerPushes(onPush: () => void) {
  if (!canPush) return;
  TaskManager.defineTask(TASK, async ({ data }) => {
    if (isTimerPush(data)) onPush();
  });
  void Notifications.registerTaskAsync(TASK);
}
