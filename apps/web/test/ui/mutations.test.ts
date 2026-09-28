import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useOptimisticMutation,
  type UseOptimisticMutationOptions,
} from '@/lib/client/mutations';
import { ApiError } from '@/lib/client/api';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function setup<TVariables, TData, TCache>(
  opts: UseOptimisticMutationOptions<TVariables, TData, TCache>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { result } = renderHook(() => useOptimisticMutation(opts), {
    wrapper: wrapper(queryClient),
  });
  return { queryClient, result };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useOptimisticMutation', () => {
  it('predicted mode: writes the prediction synchronously, rolls back with a reason on error', async () => {
    const key = ['thing'] as const;
    const { queryClient, result } = setup<
      { value: string },
      { value: string },
      { value: string }
    >({
      mutationFn: () =>
        Promise.reject(new ApiError(409, { code: 'X', message: 'rejected' })),
      queryKey: () => key,
      predict: (vars) => ({ value: vars.value }),
    });

    queryClient.setQueryData(key, { value: 'original' });

    act(() => {
      result.current.mutate({ value: 'predicted' });
    });

    // Same tick: the predicted value is already in the cache.
    expect(queryClient.getQueryData(key)).toEqual({ value: 'predicted' });

    await waitFor(() => {
      expect(queryClient.getQueryData(key)).toEqual({ value: 'original' });
    });
    await waitFor(() => {
      expect(result.current.rollbackReason).toBe('rejected');
    });
  });

  it('rolls back after a 10s silence with "No response — try again"', async () => {
    vi.useFakeTimers();
    const key = ['thing'] as const;
    let resolvePromise: (() => void) | undefined;
    const { queryClient, result } = setup<
      { value: string },
      { value: string },
      { value: string }
    >({
      mutationFn: () =>
        new Promise((resolve) => {
          resolvePromise = () => resolve({ value: 'server' });
        }),
      queryKey: () => key,
      predict: (vars) => ({ value: vars.value }),
    });

    queryClient.setQueryData(key, { value: 'original' });

    act(() => {
      result.current.mutate({ value: 'predicted' });
    });
    expect(queryClient.getQueryData(key)).toEqual({ value: 'predicted' });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(queryClient.getQueryData(key)).toEqual({ value: 'original' });
    expect(result.current.rollbackReason).toBe('No response — try again');

    // The late response settling afterward must be a no-op.
    await act(async () => {
      resolvePromise?.();
      await Promise.resolve();
    });
    expect(queryClient.getQueryData(key)).toEqual({ value: 'original' });
  });

  it('supersession: a stale response after a newer press is a no-op (latest-press-wins)', async () => {
    const key = ['thing'] as const;
    const deferred: Array<() => void> = [];
    const { queryClient, result } = setup<
      { value: string },
      { value: string },
      { value: string }
    >({
      mutationFn: (vars) =>
        new Promise((resolve) => {
          deferred.push(() => resolve({ value: vars.value }));
        }),
      queryKey: () => key,
      predict: (vars) => ({ value: vars.value }),
    });

    queryClient.setQueryData(key, { value: 'original' });

    act(() => {
      result.current.mutate({ value: 'first' });
    });
    act(() => {
      result.current.mutate({ value: 'second' });
    });
    expect(queryClient.getQueryData(key)).toEqual({ value: 'second' });

    // The stale ("first") response resolves after the newer press.
    await act(async () => {
      deferred[0]?.();
      await Promise.resolve();
    });

    // Still reflects the newer prediction/state, not overwritten by the stale one.
    expect(queryClient.getQueryData(key)).toEqual({ value: 'second' });

    await act(async () => {
      deferred[1]?.();
      await Promise.resolve();
    });
    expect(queryClient.getQueryData(key)).toEqual({ value: 'second' });
  });

  it('pending mode (predict omitted): writes nothing to the cache, only flips isPending', async () => {
    const key = ['thing'] as const;
    let resolvePromise: (() => void) | undefined;
    const { queryClient, result } = setup<
      { value: string },
      { value: string },
      unknown
    >({
      mutationFn: () =>
        new Promise((resolve) => {
          resolvePromise = () => resolve({ value: 'server' });
        }),
      queryKey: () => key,
    });

    queryClient.setQueryData(key, { value: 'original' });

    act(() => {
      result.current.mutate({ value: 'predicted' });
    });

    expect(queryClient.getQueryData(key)).toEqual({ value: 'original' });
    expect(result.current.isPending).toBe(true);
    expect(result.current.isPredicted).toBe(false);

    await act(async () => {
      resolvePromise?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(queryClient.getQueryData(key)).toEqual({ value: 'original' });
  });
});
