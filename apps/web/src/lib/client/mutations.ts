'use client';

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from './api';

/**
 * The one seam every mutation goes through (Constitution VI).
 *
 * Predicted mode (`predict` given): `onMutate` snapshots the current cache
 * value, writes the prediction, and stamps a token — same frame, no
 * `await` between the two (FR-001). A rejection or a 10s silence rolls
 * back to the snapshot with a stated reason (FR-002/FR-013), never
 * silently (Constitution I).
 *
 * Pending mode (`predict` omitted): no cache write. The caller renders
 * `isPending`/`isPredicted` for its own in-progress UI (FR-004).
 *
 * Supersession: tokens are kept per query key. An effect (success, error,
 * timeout) only applies if its token is still the latest recorded for
 * that key — a stale settlement is a no-op (FR-008/FR-014).
 *
 * `check-mutation-usage.mjs` fails any other file that imports
 * `useMutation` directly (FR-009, SC-005).
 */

const tokensByKey = new Map<string, number>();

function keyString(key: QueryKey): string {
  return JSON.stringify(key);
}

function nextToken(key: QueryKey): number {
  const k = keyString(key);
  const next = (tokensByKey.get(k) ?? 0) + 1;
  tokensByKey.set(k, next);
  return next;
}

function isLatest(key: QueryKey, token: number): boolean {
  return tokensByKey.get(keyString(key)) === token;
}

export interface UseOptimisticMutationOptions<TVariables, TData, TCache> {
  mutationFn: (vars: TVariables) => Promise<TData>;
  queryKey: (vars: TVariables) => QueryKey;
  /** Predicted mode when present; pending mode when omitted. */
  predict?: (vars: TVariables, current: TCache | undefined) => TCache;
  onSettled?: (data: TData | undefined, vars: TVariables) => void;
  /** Default 10s (FR-013). */
  timeoutMs?: number;
}

export type UseOptimisticMutationResult<TVariables, TData> = UseMutationResult<
  TData,
  ApiError,
  TVariables
> & {
  isPredicted: boolean;
  rollbackReason: string | null;
};

interface MutationContext<TCache> {
  key: QueryKey;
  token: number;
  snapshot: TCache | undefined;
  settled: { done: boolean };
  timer: ReturnType<typeof setTimeout>;
}

export function useOptimisticMutation<TVariables, TData, TCache = unknown>(
  opts: UseOptimisticMutationOptions<TVariables, TData, TCache>,
): UseOptimisticMutationResult<TVariables, TData> {
  const queryClient = useQueryClient();
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const [rollbackReason, setRollbackReason] = useState<string | null>(null);

  const settleOnce = (
    key: QueryKey,
    token: number,
    settled: { done: boolean },
    fn: () => void,
  ) => {
    if (settled.done) return;
    if (!isLatest(key, token)) {
      settled.done = true;
      return;
    }
    settled.done = true;
    fn();
  };

  const mutation = useMutation<
    TData,
    ApiError,
    TVariables,
    MutationContext<TCache>
  >({
    mutationFn: opts.mutationFn,
    onMutate: async (vars) => {
      const key = opts.queryKey(vars);
      await queryClient.cancelQueries({ queryKey: key });

      const snapshot = queryClient.getQueryData<TCache>(key);
      const token = nextToken(key);

      if (opts.predict) {
        queryClient.setQueryData<TCache>(key, opts.predict(vars, snapshot));
      }
      setRollbackReason(null);

      const settled = { done: false };
      const timer = setTimeout(() => {
        settleOnce(key, token, settled, () => {
          setRollbackReason('No response — try again');
          if (opts.predict) {
            queryClient.setQueryData<TCache>(key, snapshot);
          }
        });
      }, timeoutMs);

      return { key, token, snapshot, settled, timer };
    },
    onError: (err, _vars, context) => {
      if (!context) return;
      clearTimeout(context.timer);
      settleOnce(context.key, context.token, context.settled, () => {
        setRollbackReason(err.message);
        if (opts.predict) {
          queryClient.setQueryData<TCache>(context.key, context.snapshot);
        }
      });
    },
    onSuccess: (_data, _vars, context) => {
      if (!context) return;
      clearTimeout(context.timer);
      // A confirmed prediction stays as-is; onSettled below invalidates.
      context.settled.done = true;
    },
    onSettled: (data, _error, vars, context) => {
      if (context) clearTimeout(context.timer);
      opts.onSettled?.(data, vars);
    },
  });

  return Object.assign(mutation, {
    isPredicted: Boolean(opts.predict) && mutation.isPending,
    rollbackReason,
  });
}
