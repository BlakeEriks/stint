'use client';

import {
  hashKey,
  MutationObserver,
  useMutation,
  useMutationState,
  useQueryClient,
  type MutationObserverOptions,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  ApiError,
  type Include,
  type Included,
  type IncludedName,
} from './api.ts';
import { keys } from './query-keys.ts';

/**
 * The one way the web and phone apps write (Constitution VI). Every press
 * answers in the same frame:
 *
 * - **Predicted** (`predict` given): the cache entry at `queryKey` shows the
 *   result at once. A rejection puts the snapshot back.
 * - **Pending** (`predict` omitted): for a result the client cannot know or
 *   cannot take back — the caller renders `isPending` on the control, and no
 *   cache shows a result (so no `alsoPredict`).
 *
 * This is TanStack Query's own optimistic-update pattern: `onMutate`
 * snapshots and writes, `onError` restores, `onSettled` refetches. Two
 * additions:
 *
 * - **Latest press wins.** Presses on the same `queryKey` can overlap. Only
 *   the last one to settle restores or refetches, so an earlier answer never
 *   overwrites a newer prediction; the refetch then shows the server's truth.
 * - **A 10s bound on a prediction.** A silent server fails a predicted press
 *   like any rejection. The request is not abandoned: if it lands late, what
 *   it touched is refetched, so a change the server did make is never hidden.
 *   A pending press has no bound: it already shows it is waiting, and "try
 *   again" on a write that did land could make it twice (an invoice).
 * - **`serial`** sends presses in one lane to the server in press order,
 *   while each still shows its prediction at once — Start then Stop must
 *   reach the server in that order (TanStack's mutation `scope`).
 * - **`include`** settles what the write route returned beside its record
 *   (`?include=`) from that answer, rather than a refetch a round trip later.
 *
 * A failure is never silent (Constitution I): `MutationNotice` shows the
 * reason for every failed mutation in the cache, so it still shows after the
 * component that pressed has unmounted.
 *
 * `pressOnce` runs the same rules with no component.
 * `scripts/check-mutation-usage.mjs` fails any other file that imports
 * `useMutation` or `MutationObserver`.
 */
export type OptimisticOptions<TVars, TData, TCache> = BaseOptions<
  TVars,
  TData
> &
  (
    | {
        /**
         * The result to show at once, for each cached query under
         * `queryKey`, given that query's own key. Omit for pending mode.
         */
        predict: (
          current: TCache | undefined,
          vars: TVars,
          key: QueryKey,
        ) => TCache | undefined;
        /**
         * More caches the press predicts, beside `queryKey`'s: put back with
         * them on a rejection, and refreshed by `invalidate`.
         */
        alsoPredict?: Array<{
          queryKey: QueryKey;
          predict: (current: unknown, vars: TVars, key: QueryKey) => unknown;
        }>;
      }
    | { predict?: undefined; alsoPredict?: undefined }
  );

interface BaseOptions<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * What the press changes, and the scope of "latest press". A prefix: the
   * prediction applies to every cached query under it, so each filtered
   * variant of a list agrees.
   */
  queryKey: (vars: TVars) => QueryKey;
  /**
   * What `mutationFn` asks the server to return beside the record. Each read
   * the answer carries is written into its cache key, and `invalidate` is
   * told it is `settled` so it leaves it alone.
   */
  include?: Include;
  /**
   * What to refetch once the last overlapping press settles. Defaults to
   * `queryKey`. `settled` names what the answer already brought.
   */
  invalidate?: (
    queryClient: QueryClient,
    vars: TVars,
    settled: readonly IncludedName[],
  ) => unknown;
  onSuccess?: (data: TData, vars: TVars) => unknown;
  /** Undo anything the caller showed beyond the cache, such as a row's exit. */
  onError?: (error: Error, vars: TVars) => void;
  /** After the last overlapping press settles and its refetch lands. */
  onSettled?: (vars: TVars) => void;
  /**
   * The pressing screen explains a failure itself, so the notice stays out
   * of it. Only for a pending-mode form that stays open until the answer.
   */
  inline?: boolean;
  /** The press changes Home's figures, which show it is settling until they count it. */
  movesHome?: boolean;
  /** A lane whose presses reach the server one at a time, in press order. */
  serial?: string;
  timeoutMs?: number;
}

interface Context {
  key: QueryKey;
  snapshot: Array<[QueryKey, unknown]>;
}

/** Where each read a write can include is cached. */
const INCLUDED_KEY: Record<IncludedName, (tz: string) => QueryKey> = {
  summary: (tz) => keys.summary(tz),
  stats: (tz) => keys.stats(tz),
};

export const TIMEOUT_MS = 10_000;

export function useOptimisticMutation<
  TVars = void,
  TData = unknown,
  TCache = unknown,
>(opts: OptimisticOptions<TVars, TData, TCache>) {
  return useMutation(optimisticOptions(useQueryClient(), opts));
}

/**
 * One press with no component to hold it, such as a phone's widget: the
 * hook's own rules, on the same `QueryClient`, so it shares the app's lanes.
 * Rejects with the press's failure.
 */
export function pressOnce<TVars, TData, TCache>(
  queryClient: QueryClient,
  opts: OptimisticOptions<TVars, TData, TCache>,
  vars: TVars,
): Promise<TData> {
  return new MutationObserver(
    queryClient,
    optimisticOptions(queryClient, opts),
  ).mutate(vars);
}

/** `useOptimisticMutation`'s rules, as TanStack's mutation options. */
function optimisticOptions<TVars, TData, TCache>(
  queryClient: QueryClient,
  opts: OptimisticOptions<TVars, TData, TCache>,
): MutationObserverOptions<TData, Error, TVars, Context> {
  const refetch = (vars: TVars, settled: readonly IncludedName[] = []) =>
    opts.invalidate
      ? opts.invalidate(queryClient, vars, settled)
      : queryClient.invalidateQueries({ queryKey: opts.queryKey(vars) });

  /** Writes what the answer included into its cache; returns what it wrote. */
  const settleIncluded = async (
    data: TData | undefined,
  ): Promise<IncludedName[]> => {
    const included = (data as { included?: Included } | undefined)?.included;
    if (!opts.include || !included) return [];
    const { tz } = opts.include;
    const names = opts.include.names.filter((n) => included[n] !== undefined);
    for (const name of names) {
      const queryKey = INCLUDED_KEY[name](tz);
      // A read in flight began before this answer, and would land over it.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, included[name]);
    }
    return names;
  };

  // Presses on this key still in flight, the settling one included.
  const inFlight = (key: QueryKey) =>
    queryClient.isMutating({
      predicate: (m) => {
        const ctx = m.state.context as Context | undefined;
        return ctx !== undefined && hashKey(ctx.key) === hashKey(key);
      },
    });

  const predicts = opts.predict !== undefined;

  return {
    meta: { inline: opts.inline ?? false, movesHome: opts.movesHome ?? false },
    scope: opts.serial ? { id: opts.serial } : undefined,
    mutationFn: (vars) =>
      predicts
        ? withTimeout(opts.mutationFn(vars), opts.timeoutMs ?? TIMEOUT_MS, () =>
            refetch(vars),
          )
        : opts.mutationFn(vars),
    onMutate: (vars) => {
      const key = opts.queryKey(vars);
      /* `alsoPredict`'s caches keep the time they were fetched: a figure
         beside the prediction, such as money, still counts only what was
         fetched then (`usePressedSince`). */
      const predictions = [
        ...(opts.predict
          ? [
              {
                queryKey: key,
                predict: opts.predict as Predict<TVars>,
                keepsAge: false,
              },
            ]
          : []),
        ...(opts.alsoPredict ?? []).map((p) => ({ ...p, keepsAge: true })),
      ];
      const snapshot: Context['snapshot'] = [];
      for (const prediction of predictions) {
        snapshot.push(...predictInto(queryClient, prediction, vars));
      }
      return { key, snapshot };
    },
    onError: (err, vars, ctx) => {
      opts.onError?.(err, vars);
      if (predicts && ctx && inFlight(ctx.key) === 1) {
        for (const [key, data] of ctx.snapshot)
          queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data, vars) => opts.onSuccess?.(data, vars),
    onSettled: async (data, _err, vars, ctx) => {
      if (ctx && inFlight(ctx.key) > 1) return;
      await refetch(vars, await settleIncluded(data));
      opts.onSettled?.(vars);
    },
  };
}

/**
 * Whether a press that moves Home (`movesHome`) is still in flight and began
 * after `updatedAt` — so data fetched then doesn't count it yet. The press's
 * answer or refetch updates the data and ends it.
 */
export function usePressedSince(updatedAt: number): boolean {
  const pressedAt = useMutationState({
    filters: {
      status: 'pending',
      predicate: (m) => m.options.meta?.movesHome === true,
    },
    select: (m) => m.state.submittedAt,
  });
  return pressedAt.some((at) => at >= updatedAt);
}

type Predict<TVars> = (current: unknown, vars: TVars, key: QueryKey) => unknown;

/**
 * Writes one prediction into every cached query under its key, and returns
 * what each held before.
 */
function predictInto<TVars>(
  queryClient: QueryClient,
  {
    queryKey,
    predict,
    keepsAge,
  }: { queryKey: QueryKey; predict: Predict<TVars>; keepsAge: boolean },
  vars: TVars,
): Context['snapshot'] {
  // Not awaited: the cancel takes effect at once, and waiting on it would
  // let a frame render before the prediction.
  void queryClient.cancelQueries({ queryKey });
  const before = queryClient.getQueriesData({ queryKey });
  for (const [cached, data] of before) {
    const updatedAt = keepsAge
      ? queryClient.getQueryState(cached)?.dataUpdatedAt
      : undefined;
    queryClient.setQueryData(cached, predict(data, vars, cached), {
      updatedAt,
    });
  }
  return before;
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
