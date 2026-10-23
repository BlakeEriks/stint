'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Settings } from './api';
import { useOptimisticMutation } from './mutations';
import { keys } from './query-keys';
import { timeZone } from './use-timer';

/**
 * Records the browser's time zone when it differs from the one saved, so
 * the daily job judges "a period has ended" where the user is.
 */
export function useRecordTimeZone() {
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  const record = useOptimisticMutation({
    queryKey: () => keys.settings(),
    mutationFn: (zone: string) => api.updateSettings({ timeZone: zone }),
    predict: (current: Settings | undefined, zone) =>
      current ? { ...current, timeZone: zone } : current,
  });
  const saved = settings?.timeZone;
  const loaded = settings !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per answer, not per render
  useEffect(() => {
    if (loaded && saved !== timeZone) record.mutate(timeZone);
  }, [loaded, saved]);
}
