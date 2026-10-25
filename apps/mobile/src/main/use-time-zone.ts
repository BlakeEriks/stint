import { currentTimeZone, keys } from '@stint/client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The phone's zone, asked again each time the app comes to the foreground:
 * a process can live for days and cross zones, and "today" moves with it.
 * A move refetches the summary, whose cache key carries no zone.
 */
export function useTimeZone(): string {
  const queryClient = useQueryClient();
  const [zone, setZone] = useState(currentTimeZone);
  const last = useRef(zone);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const now = currentTimeZone();
      if (state !== 'active' || now === last.current) return;
      last.current = now;
      setZone(now);
      void queryClient.invalidateQueries({ queryKey: keys.summary() });
    });
    return () => sub.remove();
  }, [queryClient]);
  return zone;
}
