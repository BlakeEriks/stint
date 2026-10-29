'use client';

import { userTopic } from '@stint/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { browserClient } from './supabase';

/**
 * Calls `onChange` each time the server broadcasts that this user's running
 * timer changed (`pushTimerChanged`), on the private topic only they may
 * join. Returns the unsubscribe. A dropped socket rejoins on its own, and
 * the timer's poll covers the gap.
 */
export function listenForTimerChanges(onChange: () => void): () => void {
  const supabase = browserClient();
  let channel: RealtimeChannel | null = null;
  let stopped = false;
  void supabase.auth.getSession().then(async ({ data }) => {
    const userId = data.session?.user.id;
    if (!userId || stopped) return;
    // A private topic is joined with the session's token, not the anon key.
    await supabase.realtime.setAuth();
    if (stopped) return;
    channel = supabase
      .channel(userTopic(userId), { config: { private: true } })
      .on('broadcast', { event: '*' }, onChange)
      .subscribe();
  });
  return () => {
    stopped = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
