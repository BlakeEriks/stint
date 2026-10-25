import type { PushTokens } from './push.ts';

/** The web render has no push: Android's FCM is the only provider (#463). */
export const canPush = false;

export const expoTokens: PushTokens = {
  get: () => Promise.reject(new Error('No push on the web')),
  onChange: () => () => {},
};

export function listenForTimerPushes(_onPush: () => void) {}
