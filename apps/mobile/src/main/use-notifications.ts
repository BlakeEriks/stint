import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { notificationAccess } from '../screen-state.ts';
import { notifications } from '../surfaces-native';

/** Asked at most once a launch; Android itself stops after a second refusal. */
let asked = false;

/**
 * The running timer's notification needs Android 13's permission. It is
 * asked as soon as the signed-in screen opens, since a timer started on the
 * web pins it with the app closed, and read again whenever the app returns,
 * as from Settings. Returns whether it is off, which the screen says.
 */
export function useNotificationsOff(onTurnedOn: () => void): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    let was: 'on' | 'ask' | 'off' | null = null;
    const check = async () => {
      let p = await notifications.read();
      if (!p) return;
      if (notificationAccess(p) === 'ask' && !asked) {
        asked = true;
        p = await notifications.ask();
      }
      const now = p.granted ? 'on' : 'off';
      if (now === 'on' && was !== 'on') onTurnedOn();
      was = now;
      setOff(now === 'off');
    };
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [onTurnedOn]);
  return off;
}
