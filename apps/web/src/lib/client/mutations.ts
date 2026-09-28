'use client';

import {
  hashKey,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * The one way the web app writes (Constitution VI). Every press answers in
 * the same frame:
 *
 * - **Predicted** (`predict` given): the cache entry at `queryKey` shows the
 *   result at once. A rejection puts the snapshot back.
 * - **Pending** (`predict` omitted): for a result the client cannot know or
 *   cannot take back — the caller renders `isPending` on the control.
 *
 * This is TanStack Query's own optimistic-update pattern: `onMutate`
 * snapshots and writes, `onError` restores, `onSettled` refetches. Two
 * additions:
 *
 * - **Latest press wins.** Presses on the same `queryKey` can overlap. Only
 *   the last one to settle restores or refetches, so an earlier answer never
 *   overwrites a newer prediction; the refetch then shows the server's truth.
 * - **A 10s bound.** A silent server fails the press like any rejection.
 *   The request is not abandoned: if it lands late, what it touched is
 *   refetched, so a change the server did make is never hidden.
 *
 * A failure is never silent (Constitution I): `MutationNotice` shows the
 * reason for every failed mutation in the cache, so it still shows after the
 * component that pressed has unmounted.
 *
 * `scripts/check-mutation-usage.mjs` fails any other file that imports
 * `useMutation`.
 */
export interface OptimisticOptions<TVars, TData, TCache> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * What the press changes, and the scope of "latest press". A prefix: the
   * prediction applies to every cached query under it, so each filtered
   * variant of a list agrees.
   */
  queryKey: (vars: TVars) => QueryKey;
  /** The result to show at once, per cached query. Omit for pending mode. */
  predict?: (current: TCache | undefined, vars: TVars) => TCache | undefined;
  /** What to refetch once the last overlapping press settles. Defaults to `queryKey`. */
  invalidate?: (queryClient: QueryClient, vars: TVars) => unknown;
  onSuccess?: (data: TData, vars: TVars) => unknown;
  /** Undo anything the caller showed beyond the cache, such as a row's exit. */
  onError?: (error: Error, vars: TVars) => void;
  /** After the refetch, whether the press succeeded or not. */
  onSettled?: (vars: TVars) => void;
  /**
   * The pressing screen explains a failure itself, so the notice stays out
   * of it. Only for a pending-mode form that stays open until the answer.
   */
  inline?: boolean;
  timeoutMs?: number;
}

interface Context<TCache> {
  key: QueryKey;
  snapshot: Array<[QueryKey, TCache | undefined]>;
}

export const TIMEOUT_MS = 10_000;

export function useOptimisticMutation<
  TVars = void,
  TData = unknown,
  TCache = unknown,
>(opts: OptimisticOptions<TVars, TData, TCache>) {
  const queryClient = useQueryClient();

  const refetch = (vars: TVars) =>
    opts.invalidate
      ? opts.invalidate(queryClient, vars)
      : queryClient.invalidateQueries({ queryKey: opts.queryKey(vars) });

  // Presses on this key still in flight, the settling one included.
  const inFlight = (key: QueryKey) =>
    queryClient.isMutating({
      predicate: (m) => {
        const ctx = m.state.context as Context<TCache> | undefined;
        return ctx !== undefined && hashKey(ctx.key) === hashKey(key);
      },
    });

  return useMutation<TData, Error, TVars, Context<TCache>>({
    meta: { inline: opts.inline ?? false },
    mutationFn: (vars) =>
      withTimeout(opts.mutationFn(vars), opts.timeoutMs ?? TIMEOUT_MS, () =>
        refetch(vars),
      ),
    onMutate: (vars) => {
      const key = opts.queryKey(vars);
      // Not awaited: the cancel takes effect at once, and waiting on it
      // would let a frame render before the prediction.
      void queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueriesData<TCache>({ queryKey: key });
      if (opts.predict) {
        queryClient.setQueriesData<TCache>({ queryKey: key }, (current) =>
          opts.predict!(current, vars),
        );
      }
      return { key, snapshot };
    },
    onError: (err, vars, ctx) => {
      opts.onError?.(err, vars);
      if (opts.predict && ctx && inFlight(ctx.key) === 1) {
        for (const [key, data] of ctx.snapshot)
          queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data, vars) => opts.onSuccess?.(data, vars),
    onSettled: async (_data, _err, vars, ctx) => {
      if (!ctx || inFlight(ctx.key) === 1) await refetch(vars);
      opts.onSettled?.(vars);
    },
  });
}

/**
 * Fails `call` after `ms` without abandoning it: `late` runs if it settles
 * after that, so whatever it changed on the server gets refetched.
 */
function withTimeout<T>(
  call: Promise<T>,
  ms: number,
  late: () => void,
): Promise<T> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(
        new ApiError(0, {
          code: 'TIMEOUT',
          message: 'The server didn’t answer. Try again.',
        }),
      );
    }, ms);
  });
  call
    .finally(() => {
      clearTimeout(timer);
      if (timedOut) late();
    })
    .catch(() => {});
  return Promise.race([call, timeout]);
}
