import { currentTimeZone } from '@stint/client';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The phone's zone, asked again each time the app comes to the foreground:
 * a process can live for days and cross zones, and "today" moves with it.
 */
export function useTimeZone(): string {
  const [zone, setZone] = useState(currentTimeZone);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setZone(currentTimeZone());
    });
    return () => sub.remove();
  }, []);
  return zone;
}
