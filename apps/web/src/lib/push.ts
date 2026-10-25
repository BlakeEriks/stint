import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushOutcome } from '@stint/core';
import type { PushPlatform } from '@stint/schema';
import { report } from './errors';
import { fcm } from './fcm';

/** One platform's sender. `detail` is what a failure reports. */
export interface PushProvider {
  send(token: string): Promise<{ outcome: PushOutcome; detail: string }>;
}

/* By platform, each null until its credentials are set. APNs goes beside
   it as `ios`. */
const PROVIDERS: Record<PushPlatform, () => PushProvider | null> = {
  android: fcm,
};

const RETRY_MS = 1000;

/**
 * Tells each of the user's phones the running timer changed, once the
 * response is out (`after()`), so a slow or failing provider never delays or
 * fails the write. A failure reaches Sentry; a token the provider calls
 * unregistered is deleted.
 */
export function pushTimerChanged(db: SupabaseClient, userId: string) {
  after(() => send(db, userId).catch(report));
}

async function send(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('push_devices')
    .select('token, platform')
    .eq('user_id', userId);
  if (error) throw error;
  await Promise.all(
    (data as { token: string; platform: PushPlatform }[]).map(
      async ({ token, platform }) => {
        const provider = PROVIDERS[platform]();
        if (!provider) return;
        await deliver(db, userId, provider, token).catch(report);
      },
    ),
  );
}

async function deliver(
  db: SupabaseClient,
  userId: string,
  provider: PushProvider,
  token: string,
) {
  let sent = await attempt(provider, token);
  if (sent.outcome === 'retry') {
    await new Promise((r) => setTimeout(r, RETRY_MS));
    sent = await attempt(provider, token);
  }
  if (sent.outcome === 'dead') {
    const { error } = await db
      .from('push_devices')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
    if (error) throw error;
    return;
  }
  if (sent.outcome !== 'sent') {
    throw new Error(`Push not delivered: ${sent.detail}`);
  }
}

/** A network failure is worth the retry a 5xx gets. */
async function attempt(provider: PushProvider, token: string) {
  try {
    return await provider.send(token);
  } catch (err) {
    if (err instanceof TypeError) {
      return { outcome: 'retry' as const, detail: err.message };
    }
    throw err;
  }
}
