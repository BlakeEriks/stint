import { ApiError, invalidateEntryData } from '@stint/client';
import type { QueryClient } from '@tanstack/react-query';

/**
 * The server pushes a phone when the running timer changes, from any
 * client. The push says only that: the phone asks the server, as it does
 * on foreground. Android only, over FCM; the iPhone has no provider yet.
 */

/** The data message the server sends (`fcmTimerMessage()` in `@stint/core`),
 *  as the notification task receives it. */
export function isTimerPush(payload: unknown): boolean {
  return (
    (payload as { data?: { kind?: unknown } } | undefined)?.data?.kind ===
    'timer'
  );
}

/**
 * Refetches the timer and what it moves. A press in flight skips the push:
 * a refetch landing before the server has the press would put the old
 * timer back over its prediction, and the press refetches when it settles
 * (`followRunningTimer`'s rule).
 */
export function onTimerPush(queryClient: QueryClient) {
  if (queryClient.isMutating() > 0) return;
  return invalidateEntryData(queryClient);
}

/** The phone's address with the provider: Expo's in the app, a fake in tests. */
export interface PushTokens {
  get(): Promise<string>;
  /** Returns the unsubscribe. */
  onChange(listener: (token: string) => void): () => void;
}

interface Options {
  tokens: PushTokens;
  register: (token: string) => Promise<unknown>;
  unregister: (token: string) => Promise<unknown>;
}

/**
 * This phone on the account while it is signed in. Offline, a register is
 * tried again on the next launch and an unregister is dropped, so sign-out
 * never waits on the network; a token left behind wakes a signed-out app,
 * which asks nothing.
 */
export function createPushDevice({ tokens, register, unregister }: Options) {
  let registered: string | null = null;
  let off: (() => void) | null = null;

  async function use(token: string) {
    try {
      await register(token);
      registered = token;
    } catch (err) {
      offline(err);
    }
  }

  return {
    /** On every sign-in and launch: registering again changes nothing. */
    async join() {
      off ??= tokens.onChange((token) => {
        if (token !== registered) void use(token);
      });
      await use(await tokens.get());
    },
    async leave() {
      off?.();
      off = null;
      const token = registered;
      registered = null;
      if (token) await unregister(token).catch(offline);
    },
  };
}

/** A server that can't be reached, or refused: the next launch tries again. */
function offline(err: unknown) {
  if (err instanceof ApiError || err instanceof TypeError) return;
  throw err;
}
