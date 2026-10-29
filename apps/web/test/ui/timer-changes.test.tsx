import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { keys } from '@stint/client';
import { TimerChanges } from '@/components/timer-changes';

/** The browser's Supabase client, as far as the listener reaches it. */
const supabase = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  joined: [] as { topic: string; opts: unknown }[],
  removed: 0,
  hear: null as null | (() => void),
}));

vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: supabase.session } }),
    },
    realtime: { setAuth: async () => {} },
    channel(topic: string, opts: unknown) {
      supabase.joined.push({ topic, opts });
      const channel = {
        on(_type: string, _filter: unknown, cb: () => void) {
          supabase.hear = cb;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: async () => {
      supabase.removed += 1;
    },
  }),
}));

function mount() {
  const qc = new QueryClient();
  const key = keys.summary('UTC');
  qc.setQueryData(key, { running: null });
  const view = render(
    <QueryClientProvider client={qc}>
      <TimerChanges />
    </QueryClientProvider>,
  );
  const stale = () => qc.getQueryState(key)?.isInvalidated;
  return { ...view, stale };
}

beforeEach(() => {
  supabase.session = { user: { id: 'u1' } };
  supabase.joined = [];
  supabase.removed = 0;
  supabase.hear = null;
});

describe('TimerChanges', () => {
  it('joins the user’s private topic and refetches the timer on a broadcast', async () => {
    const { stale } = mount();
    await waitFor(() => expect(supabase.hear).not.toBeNull());
    expect(supabase.joined).toEqual([
      { topic: 'user:u1', opts: { config: { private: true } } },
    ]);
    expect(stale()).toBe(false);
    supabase.hear?.();
    expect(stale()).toBe(true);
  });

  it('leaves the topic when it unmounts', async () => {
    const { unmount } = mount();
    await waitFor(() => expect(supabase.hear).not.toBeNull());
    unmount();
    expect(supabase.removed).toBe(1);
  });

  it('joins nothing when signed out', async () => {
    supabase.session = null;
    mount();
    await new Promise((r) => setTimeout(r, 0));
    expect(supabase.joined).toEqual([]);
  });
});
