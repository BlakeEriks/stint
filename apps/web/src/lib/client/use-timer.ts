'use client';

import { useTimer as useTimerWith } from '@stint/client';
import { api } from './api';

export { timeZone } from '@stint/client';

/** The shared timer (`@stint/client`), on the web's cookie `api`. */
export const useTimer = () => useTimerWith(api);
