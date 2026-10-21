import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  render,
  renderHook,
  screen,
  act,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useOptimisticMutation,
  usePressedSince,
  type OptimisticOptions,
} from '@/lib/client/mutations';
import { MutationNotice } from '@/components/mutation-notice';
import { ApiError } from '@/lib/client/api';

type Vars = { value: string };
type Cache = { value: string };
const key = ['thing'];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  opts: Partial<OptimisticOptions<Vars, Cache, Cache>> &
    Pick<OptimisticOptions<Vars, Cache, Cache>, 'mutationFn'>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(key, { value: 'original' });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useOptimisticMutation<Vars, Cache, Cache>({
        queryKey: () => key,
        predict: (_current, vars) => ({ value: vars.value }),
        ...opts,
      }),
    { wrapper },
  );
  return { queryClient, invalidate, hook, wrapper };
}

const rejection = (message: string) =>
  new ApiError(409, { code: 'X', message });
const cached = (qc: QueryClient) => qc.getQueryData<Cache>(key)?.value;

afterEach(() => vi.useRealTimers());

describe('useOptimisticMutation', () => {
  it('shows the prediction before the server answers, then refetches', async () => {
    const call = deferred<Cache>();
    const { queryClient, invalidate, hook } = setup({
      mutationFn: () => call.promise,
    });

    act(() => hook.result.current.mutate({ value: 'predicted' }));
    await waitFor(() => expect(cached(queryClient)).toBe('predicted'));
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => call.resolve({ value: 'predicted' }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key }),
    );
  });

  it('puts the snapshot back when the server rejects', async () => {
    const { queryClient, hook } = setup({
      mutationFn: () => Promise.reject(rejection('rejected')),
    });

    act(() => hook.result.current.mutate({ value: 'predicted' }));

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(cached(queryClient)).toBe('original');
    expect(hook.result.current.error?.message).toBe('rejected');
  });

  it('fails after 10s of silence, and refetches if the answer lands late', async () => {
    vi.useFakeTimers();
    const call = deferred<Cache>();
    const { queryClient, invalidate, hook } = setup({
      mutationFn: () => call.promise,
    });

    act(() => hook.result.current.mutate({ value: 'predicted' }));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await vi.waitFor(() => expect(hook.result.current.isError).toBe(true));

    expect(cached(queryClient)).toBe('original');
    expect((hook.result.current.error as ApiError).code).toBe('TIMEOUT');
    invalidate.mockClear();

    // The server did make the change; hiding it would be a silent edit.
    await act(async () => call.resolve({ value: 'predicted' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });

  it('lets the latest press win: an earlier failure does not undo a newer prediction', async () => {
    const calls = [deferred<Cache>(), deferred<Cache>()] as const;
    let n = 0;
    const { queryClient, invalidate, hook } = setup({
      mutationFn: () => calls[n++ as 0 | 1].promise,
    });

    act(() => hook.result.current.mutate({ value: 'first' }));
    act(() => hook.result.current.mutate({ value: 'second' }));
    await waitFor(() => expect(cached(queryClient)).toBe('second'));

    await act(async () => calls[0].reject(rejection('first failed')));
    expect(cached(queryClient)).toBe('second');
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => calls[1].resolve({ value: 'second' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('drops a refetch that was in flight when the press landed', async () => {
    const call = deferred<Cache>();
    const stale = deferred<Cache>();
    const { queryClient, hook } = setup({ mutationFn: () => call.promise });

    void queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => stale.promise,
      staleTime: 0,
    });
    act(() => hook.result.current.mutate({ value: 'predicted' }));
    await act(async () => stale.resolve({ value: 'original' }));

    expect(cached(queryClient)).toBe('predicted');
  });

  it('pending mode writes nothing and reports isPending', async () => {
    const call = deferred<Cache>();
    const { queryClient, hook } = setup({
      mutationFn: () => call.promise,
      predict: undefined,
    });

    act(() => hook.result.current.mutate({ value: 'predicted' }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(true));
    expect(cached(queryClient)).toBe('original');

    await act(async () => call.resolve({ value: 'server' }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(false));
  });
});

describe('useOptimisticMutation — review fixes', () => {
  it('gives a pending press no timeout: a slow write is not "try again"', async () => {
    vi.useFakeTimers();
    const call = deferred<Cache>();
    const { hook } = setup({
      mutationFn: () => call.promise,
      predict: undefined,
    });

    act(() => hook.result.current.mutate({ value: 'x' }));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(hook.result.current.isPending).toBe(true);
    expect(hook.result.current.isError).toBe(false);
  });

  /* A press can be pending on one call and predicted on the next (a start
     while a timer runs). Pending must mean the same as having no `predict`:
     no write, no timeout, nothing put back. */
  it('treats a press its `pending` picks as pending: no write, no timeout', async () => {
    vi.useFakeTimers();
    const call = deferred<Cache>();
    const { queryClient, hook } = setup({
      mutationFn: () => call.promise,
      pending: (vars) => vars.value === 'wait',
    });

    act(() => hook.result.current.mutate({ value: 'wait' }));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(cached(queryClient)).toBe('original');
    expect(hook.result.current.isPending).toBe(true);
    expect(hook.result.current.isError).toBe(false);
  });

  it('predicts each cached query under the key with that query’s own key', async () => {
    const { queryClient, hook } = setup({
      mutationFn: () => new Promise(() => {}),
      queryKey: () => ['list'],
      predict: (current, vars, k) =>
        k[1] === 'keep' ? current : { value: vars.value },
    });
    queryClient.setQueryData(['list', 'keep'], { value: 'kept' });
    queryClient.setQueryData(['list', 'change'], { value: 'old' });

    act(() => hook.result.current.mutate({ value: 'new' }));

    await waitFor(() =>
      expect(queryClient.getQueryData(['list', 'change'])).toEqual({
        value: 'new',
      }),
    );
    expect(queryClient.getQueryData(['list', 'keep'])).toEqual({
      value: 'kept',
    });
  });

  it('sends a serial lane in press order while predicting each press at once', async () => {
    const calls = [deferred<Cache>(), deferred<Cache>()] as const;
    const started: string[] = [];
    let n = 0;
    const { queryClient, hook } = setup({
      serial: 'lane',
      mutationFn: (vars) => {
        started.push(vars.value);
        return calls[n++ as 0 | 1].promise;
      },
    });

    act(() => hook.result.current.mutate({ value: 'start' }));
    act(() => hook.result.current.mutate({ value: 'stop' }));

    await waitFor(() => expect(cached(queryClient)).toBe('stop'));
    expect(started).toEqual(['start']);

    await act(async () => calls[0].resolve({ value: 'start' }));
    await waitFor(() => expect(started).toEqual(['start', 'stop']));
    await act(async () => calls[1].resolve({ value: 'stop' }));
  });

  it('runs onSettled once, after the last overlapping press', async () => {
    const calls = [deferred<Cache>(), deferred<Cache>()] as const;
    let n = 0;
    const onSettled = vi.fn();
    const { hook } = setup({
      mutationFn: () => calls[n++ as 0 | 1].promise,
      onSettled,
    });

    act(() => hook.result.current.mutate({ value: 'a' }));
    act(() => hook.result.current.mutate({ value: 'b' }));
    await act(async () => calls[0].resolve({ value: 'a' }));
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => calls[1].resolve({ value: 'b' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });
});

describe('useOptimisticMutation — include', () => {
  type Answer = { included?: { summary?: unknown; stats?: unknown } };

  function setupIncluding(
    opts: Partial<OptimisticOptions<Vars, Answer, Cache>> &
      Pick<OptimisticOptions<Vars, Answer, Cache>, 'mutationFn'>,
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(['summary'], 'old summary');
    queryClient.setQueryData(['stats', 'UTC'], 'old stats');
    const invalidate = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () =>
        useOptimisticMutation<Vars, Answer, Cache>({
          queryKey: () => key,
          predict: (_current, vars) => ({ value: vars.value }),
          include: { names: ['summary', 'stats'], tz: 'UTC' },
          invalidate,
          ...opts,
        }),
      { wrapper },
    );
    return { queryClient, invalidate, hook };
  }

  it('settles each included read from the answer, and refetches only the rest', async () => {
    const { queryClient, invalidate, hook } = setupIncluding({
      mutationFn: async () => ({
        included: { summary: 'new summary', stats: 'new stats' },
      }),
    });

    await act(async () => hook.result.current.mutate({ value: 'x' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate.mock.calls[0]?.[2]).toEqual(['summary', 'stats']);
    expect(queryClient.getQueryData(['summary'])).toBe('new summary');
    expect(queryClient.getQueryData(['stats', 'UTC'])).toBe('new stats');
  });

  it('is not overwritten by a read already in flight when the answer lands', async () => {
    const { queryClient, hook } = setupIncluding({
      mutationFn: async () => ({ included: { stats: 'new stats' } }),
    });
    const stale = deferred<string>();
    void queryClient.fetchQuery({
      queryKey: ['stats', 'UTC'],
      queryFn: () => stale.promise,
      staleTime: 0,
    });

    await act(async () => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() =>
      expect(queryClient.getQueryData(['stats', 'UTC'])).toBe('new stats'),
    );
    await act(async () => stale.resolve('stats from before the press'));

    expect(queryClient.getQueryData(['stats', 'UTC'])).toBe('new stats');
  });

  it('refetches everything when the answer brought nothing', async () => {
    const { queryClient, invalidate, hook } = setupIncluding({
      mutationFn: async () => ({}),
    });

    await act(async () => hook.result.current.mutate({ value: 'x' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate.mock.calls[0]?.[2]).toEqual([]);
    expect(queryClient.getQueryData(['summary'])).toBe('old summary');
  });

  it('writes only the last overlapping press’s answer', async () => {
    const calls = [deferred<Answer>(), deferred<Answer>()] as const;
    let n = 0;
    const { queryClient, hook } = setupIncluding({
      mutationFn: () => calls[n++ as 0 | 1].promise,
    });

    act(() => hook.result.current.mutate({ value: 'start' }));
    act(() => hook.result.current.mutate({ value: 'stop' }));
    await act(async () =>
      calls[0].resolve({ included: { summary: 'after start' } }),
    );
    expect(queryClient.getQueryData(['summary'])).toBe('old summary');

    await act(async () =>
      calls[1].resolve({ included: { summary: 'after stop' } }),
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(['summary'])).toBe('after stop'),
    );
  });

  it('predicts a second cache too, and puts it back on a rejection', async () => {
    const call = deferred<Answer>();
    const { queryClient, hook } = setupIncluding({
      mutationFn: () => call.promise,
      alsoPredict: [
        { queryKey: ['other'], predict: (_c, vars) => `other ${vars.value}` },
      ],
    });
    queryClient.setQueryData(['other'], 'other original');

    act(() => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() =>
      expect(queryClient.getQueryData(['other'])).toBe('other x'),
    );

    await act(async () => call.reject(rejection('no')));
    await waitFor(() =>
      expect(queryClient.getQueryData(['other'])).toBe('other original'),
    );
  });

  it('keeps the second cache’s fetch time, since it counts nothing newer', async () => {
    const { queryClient, hook } = setupIncluding({
      mutationFn: () => new Promise(() => {}),
      alsoPredict: [{ queryKey: ['other'], predict: () => 'predicted' }],
    });
    queryClient.setQueryData(['other'], 'fetched', { updatedAt: 1000 });

    act(() => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() =>
      expect(queryClient.getQueryData(['other'])).toBe('predicted'),
    );
    expect(queryClient.getQueryState(['other'])?.dataUpdatedAt).toBe(1000);
  });
});

describe('usePressedSince', () => {
  it('ignores a press that does not move Home', async () => {
    const { queryClient, wrapper, hook } = setup({
      mutationFn: () => new Promise(() => {}),
    });
    const fetchedAt = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
    const pressed = renderHook(() => usePressedSince(fetchedAt), { wrapper });

    act(() => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(true));
    expect(pressed.result.current).toBe(false);
  });

  it('is true only while a press made after the data is in flight', async () => {
    const call = deferred<Cache>();
    const { queryClient, wrapper, hook } = setup({
      mutationFn: () => call.promise,
      movesHome: true,
    });
    const fetchedAt = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
    const pressed = renderHook(() => usePressedSince(fetchedAt), { wrapper });
    expect(pressed.result.current).toBe(false);

    await new Promise((r) => setTimeout(r, 2));
    act(() => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() => expect(pressed.result.current).toBe(true));

    await act(async () => call.resolve({ value: 'x' }));
    await waitFor(() => expect(pressed.result.current).toBe(false));
  });
});

describe('MutationNotice', () => {
  it('explains a rollback after the screen that pressed has gone', async () => {
    const call = deferred<Cache>();
    const { hook, wrapper } = setup({ mutationFn: () => call.promise });
    render(<MutationNotice />, { wrapper });

    act(() => hook.result.current.mutate({ value: 'predicted' }));
    hook.unmount();
    await act(async () =>
      call.reject(rejection('Entry was deleted elsewhere')),
    );

    expect(await screen.findByText('Entry was deleted elsewhere')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click());
    expect(screen.queryByText('Entry was deleted elsewhere')).toBeNull();
  });

  it('clears a failure once the same press succeeds', async () => {
    let fail = true;
    const { hook, wrapper } = setup({
      mutationFn: () =>
        fail
          ? Promise.reject(rejection('The server didn’t answer.'))
          : Promise.resolve({ value: 'ok' }),
    });
    render(<MutationNotice />, { wrapper });

    act(() => hook.result.current.mutate({ value: 'x' }));
    expect(await screen.findByText('The server didn’t answer.')).toBeTruthy();

    fail = false;
    act(() => hook.result.current.mutate({ value: 'x' }));
    await waitFor(() =>
      expect(screen.queryByText('The server didn’t answer.')).toBeNull(),
    );
  });
});
