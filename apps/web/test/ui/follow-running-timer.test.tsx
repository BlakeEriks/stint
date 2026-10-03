import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { followRunningTimer, keys } from '@/lib/client/query-keys';

const running = {
  running: { id: 'e1', startedAt: '2026-10-03T09:00:00Z' },
  todaySeconds: 0,
  weekSeconds: 0,
  serverTime: '2026-10-03T09:30:00Z',
};
const idle = { ...running, running: null };

function setup() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const stop = followRunningTimer(qc);
  const fetchSummary = (data: unknown) =>
    qc.fetchQuery({
      queryKey: keys.summary(),
      queryFn: () => data,
      staleTime: 0,
    });
  const invalidated = () => spy.mock.calls.map((c) => c[0]?.queryKey);
  return { qc, spy, stop, fetchSummary, invalidated };
}

describe('followRunningTimer', () => {
  it('refetches stats and entries on each summary refetch while a timer runs', async () => {
    const { fetchSummary, invalidated } = setup();
    await fetchSummary(running); // the first load: everything is loading anyway
    expect(invalidated()).toEqual([]);

    await fetchSummary(running);
    expect(invalidated()).toEqual([keys.stats(), keys.entries()]);
  });

  it('leaves them alone with no timer running', async () => {
    const { fetchSummary, invalidated } = setup();
    await fetchSummary(idle);
    await fetchSummary(idle);
    expect(invalidated()).toEqual([]);
  });

  it('ignores a prediction written into the cache', async () => {
    const { qc, fetchSummary, invalidated } = setup();
    await fetchSummary(idle);
    qc.setQueryData(keys.summary(), running);
    expect(invalidated()).toEqual([]);
  });

  it('waits out a write in flight, so a refetch cannot undo its prediction', async () => {
    const { qc, fetchSummary, invalidated } = setup();
    await fetchSummary(running);
    let land!: () => void;
    const pending = qc
      .getMutationCache()
      .build(qc, { mutationFn: () => new Promise<void>((r) => (land = r)) })
      .execute(undefined);
    await fetchSummary(running);
    expect(invalidated()).toEqual([]);
    land();
    await pending;
  });

  it('stops following when unsubscribed', async () => {
    const { stop, fetchSummary, invalidated } = setup();
    await fetchSummary(running);
    stop();
    await fetchSummary(running);
    expect(invalidated()).toEqual([]);
  });
});
