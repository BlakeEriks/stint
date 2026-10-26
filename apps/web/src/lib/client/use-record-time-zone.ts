'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keys, useOptimisticMutation } from '@stint/client';
import { api, type Settings } from './api';
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
  /* Once per mount: a refusal puts the old zone back, and trying again on
     that would retry for as long as the server refuses. */
  const tried = useRef(false);
  const saved = settings?.timeZone;
  const loaded = settings !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per answer, not per render
  useEffect(() => {
    if (!loaded || tried.current || saved === timeZone) return;
    tried.current = true;
    record.mutate(timeZone);
  }, [loaded, saved]);
}
