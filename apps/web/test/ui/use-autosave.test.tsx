import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutosave } from '@/lib/client/use-autosave';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('useAutosave', () => {
  it('starts idle and does not save on its own', async () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save));

    expect(result.current.state).toBe('idle');
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  /**
   * The indicator's whole job: the user must never type into a field that
   * still looks saved, so pending is set on the edit, not on the request.
   */
  it('is pending the moment a value is scheduled, before any request', () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save));

    act(() => result.current.schedule({ a: 1 }));

    expect(result.current.state).toBe('pending');
    expect(save).not.toHaveBeenCalled();
  });

  it('saves once the pause elapses, then reports saved', async () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));

    act(() => result.current.schedule({ a: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenCalledExactlyOnceWith({ a: 1 });
    await waitFor(() => expect(result.current.state).toBe('saved'));
  });

  /** Typing must not fire a request per keystroke. */
  it('collapses rapid edits into one save with the last value', async () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));

    act(() => result.current.schedule({ n: 1 }));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.schedule({ n: 2 }));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.schedule({ n: 3 }));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(save).toHaveBeenCalledExactlyOnceWith({ n: 3 });
  });

  /**
   * An edit during an in-flight request queues rather than racing it —
   * otherwise a slow first response can land after a newer one and the
   * server keeps the older value.
   */
  it('queues an edit made during a save instead of racing it', async () => {
    const first = deferred();
    const save = vi
      .fn<(v: unknown) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async () => {});

    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.schedule({ n: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Second edit arrives while the first request is still open.
    act(() => result.current.schedule({ n: 2 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await first.promise;
    });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith({ n: 2 });
  });

  it('stays pending while an edit is still queued behind a save', async () => {
    const first = deferred();
    const second = deferred();
    const save = vi
      .fn<(v: unknown) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.schedule({ n: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    act(() => result.current.schedule({ n: 2 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Release only the first. The queued n:2 save is now in flight, so the
    // value the user last typed is still unacknowledged and must not read
    // as saved.
    await act(async () => {
      first.resolve();
      await first.promise;
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('pending');

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    await waitFor(() => expect(result.current.state).toBe('saved'));
  });

  it('reports an error and does not claim to be saved', async () => {
    const save = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.schedule({ a: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.error?.message).toBe('offline');
  });

  it('recovers to saved after a failure is followed by a good save', async () => {
    const save = vi
      .fn<(v: unknown) => Promise<void>>()
      .mockImplementationOnce(async () => {
        throw new Error('offline');
      })
      .mockImplementation(async () => {});

    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));

    act(() => result.current.schedule({ a: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await waitFor(() => expect(result.current.state).toBe('error'));

    act(() => result.current.schedule({ a: 2 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await waitFor(() => expect(result.current.state).toBe('saved'));
  });
});
