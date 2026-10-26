'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';

/**
 * Debounced persistence for a form that has no save button.
 *
 * The contract the indicator depends on: `pending` is set the moment a field
 * changes — not when the request goes out — so the user never types into a
 * field that looks saved. It stays pending through the debounce AND the
 * request, and only becomes `saved` once the server has acknowledged.
 *
 * Each edit is a patch, merged into every edit not yet sent, so two fields
 * edited within the pause go out together rather than the second dropping
 * the first.
 *
 * Saves are coalesced: edits during an in-flight request queue one more save
 * after it, rather than racing it. Without that, a fast typist can land an
 * older payload after a newer one.
 */
export function useAutosave<T extends object>(
  save: (value: T) => Promise<unknown>,
  { delay = 700 }: { delay?: number } = {},
) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<Error | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // Every patch scheduled since the last request went out.
  const unsent = useRef<T | null>(null);
  // The pause ended while a request was open: send `unsent` when it returns.
  const queued = useRef(false);
  const alive = useRef(true);
  // `save` is typically an inline closure; keeping it in a ref means a new
  // identity each render does not restart the debounce.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Set on mount, not just cleared on unmount: React StrictMode mounts,
  // unmounts and remounts in development, and a ref that is only ever
  // cleared stays false for the real mount — every save then completes
  // silently and the indicator spins forever.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    const value = unsent.current;
    if (value === null) return;
    unsent.current = null;
    inFlight.current = true;
    try {
      await saveRef.current(value);
      if (!alive.current) return;
      setError(null);
      // An unsent edit means this is not settled yet — stay pending.
      if (unsent.current === null) setState('saved');
    } catch (e) {
      if (!alive.current) return;
      setError(e as Error);
      setState('error');
      unsent.current = null;
      queued.current = false;
    } finally {
      inFlight.current = false;
      if (queued.current && alive.current) {
        queued.current = false;
        void flush();
      }
    }
  }, []);

  /** Call on every edit with the fields it changed. Marks pending immediately, persists after `delay`. */
  const schedule = useCallback(
    (patch: T) => {
      setState('pending');
      unsent.current = { ...unsent.current, ...patch } as T;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  return { state, error, schedule };
}
