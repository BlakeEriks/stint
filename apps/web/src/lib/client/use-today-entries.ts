'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  localDateKey,
  startOfLocalDate,
  startOfLocalDayOffset,
} from '@stint/core';
import { appNow, keys } from '@stint/client';
import { api } from './api';
import { timeZone as tz } from './use-timer';

/**
 * Today's entries, running included, local midnight to local midnight: the
 * date read as a UTC day starts the previous evening anywhere west of
 * Greenwich. One hook, so Home's Today, the dock's list and the grid read
 * one query and a screen can gate on it.
 */
export function useTodayEntries() {
  const today = useLocalDay();
  const from = startOfLocalDate(today, tz);
  const to = new Date(startOfLocalDayOffset(from, tz, -1).getTime() - 1);
  return useQuery({
    queryKey: keys.entries({ from: from.toISOString(), to: to.toISOString() }),
    queryFn: () =>
      api.entries({ from: from.toISOString(), to: to.toISOString() }),
    select: (r) => r.entries,
  });
}

/**
 * Today's local date key, rechecked once a minute so a tab left open past
 * midnight moves to the new day. Held in state rather than read in render:
 * the key changes only when the day does, not on every beat and refetch.
 *
 * The new day refetches `/stats` too: Earned comes from there, and without
 * it the new date would sit beside yesterday's earnings.
 */
function useLocalDay(): string {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(() => localDateKey(appNow(), tz));
  useEffect(() => {
    const id = setInterval(() => {
      const next = localDateKey(appNow(), tz);
      if (next === day) return;
      setDay(next);
      void queryClient.invalidateQueries({ queryKey: keys.stats() });
    }, 60_000);
    return () => clearInterval(id);
  }, [day, queryClient]);
  return day;
}
