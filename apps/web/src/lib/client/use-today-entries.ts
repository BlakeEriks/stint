'use client';

import { useEffect, useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  localDateKey,
  startOfLocalDate,
  startOfLocalDayOffset,
} from '@stint/core';
import { appNow, keys } from '@stint/client';
import { api } from './api';
import { useNow } from './use-now';
import { timeZone as tz } from './use-timer';

/**
 * Today's entries, running included, local midnight to local midnight: the
 * date read as a UTC day starts the previous evening anywhere west of
 * Greenwich. One hook, so Home's Today, the dock's list and the grid read
 * one query and a screen can gate on it. Nothing is asked for until the
 * day is known, after hydration.
 */
export function useTodayEntries() {
  const range = dayRange(useLocalDay());
  return useQuery({
    queryKey: keys.entries(range ?? undefined),
    queryFn: range ? () => api.entries(range) : skipToken,
    select: (r) => r.entries,
  });
}

function dayRange(day: string | null) {
  if (day === null) return null;
  const from = startOfLocalDate(day, tz);
  const to = new Date(startOfLocalDayOffset(from, tz, -1).getTime() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Today's local date key, null until hydrated, rechecked once a minute so a tab left open past
 * midnight moves to the new day. Held in state rather than read in render:
 * the key changes only when the day does, not on every beat and refetch.
 *
 * The new day refetches `/stats` too: Earned comes from there, and without
 * it the new date would sit beside yesterday's earnings.
 */
function useLocalDay(): string | null {
  const queryClient = useQueryClient();
  const now = useNow();
  const [moved, setMoved] = useState<string | null>(null);
  const day = moved ?? (now && localDateKey(now, tz));
  useEffect(() => {
    if (day === null) return;
    const id = setInterval(() => {
      const next = localDateKey(appNow(), tz);
      if (next === day) return;
      setMoved(next);
      void queryClient.invalidateQueries({ queryKey: keys.stats() });
    }, 60_000);
    return () => clearInterval(id);
  }, [day, queryClient]);
  return day;
}
