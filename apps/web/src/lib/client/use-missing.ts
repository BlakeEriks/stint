'use client';

import { useCallback, useState } from 'react';

/**
 * What a form still lacks, keyed by each control's id in the order the form
 * shows them; `undefined` where the field is fine.
 */
export type Missing = Record<string, string | undefined>;

/* A shape check only; the server's `z.email()` is the full rule. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Save stays enabled while a form is incomplete, because a disabled button
 * can't say what it waits for, and a tooltip never reaches a phone. The
 * press asks `passes()`: when something is missing, each such field shows
 * why, the first takes focus, and the form doesn't save. A message goes as
 * soon as its field is fixed.
 */
export function useMissing(missing: Missing) {
  const [shown, setShown] = useState(false);
  const reset = useCallback(() => setShown(false), []);
  return {
    passes() {
      const first = Object.keys(missing).find((id) => missing[id]);
      setShown(first !== undefined);
      if (first === undefined) return true;
      document.getElementById(first)?.focus();
      return false;
    },
    /** For `Field`'s `error`. */
    error: (id: string) => (shown ? missing[id] : undefined),
    /** For a dialog that stays mounted: forget the last press on reopen.
        Stable, so an effect can list it. */
    reset,
  };
}
