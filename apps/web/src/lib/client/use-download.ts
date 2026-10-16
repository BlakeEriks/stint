'use client';

import { useState } from 'react';
import { api, ApiError } from './api';
import { timeZone } from './use-timer';

/**
 * One export download: pending on its button while the server prepares the
 * file (Constitution VI), then saved under the name the server gave it.
 *
 * Fetched rather than a plain `<a download>`, which waits silently until the
 * headers arrive and can save an error body as the file.
 */
export function useDownload(kind: 'entries' | 'invoices') {
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle');

  async function download() {
    setState('pending');
    let file: Awaited<ReturnType<typeof api.exportCsv>>;
    try {
      file = await api.exportCsv(kind, timeZone);
    } catch (error) {
      // The server refused, or the network dropped (fetch's TypeError).
      const expected = error instanceof ApiError || error instanceof TypeError;
      setState(expected ? 'failed' : 'idle');
      if (!expected) throw error;
      return;
    }
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    // After the click has handed the file to the browser, not before.
    setTimeout(() => URL.revokeObjectURL(url));
    setState('idle');
  }

  return { pending: state === 'pending', failed: state === 'failed', download };
}
