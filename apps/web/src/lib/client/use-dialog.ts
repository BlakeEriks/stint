'use client';

import { useCallback, useState } from 'react';

/**
 * A dialog and what it is open for, such as the record it edits.
 *
 * **Closing keeps the subject**: Radix plays the exit animation over the
 * last render, so a subject cleared on close would show the dialog
 * switching to "new" mode as it leaves. Only the next `show` replaces it.
 */
export function useDialog<T>() {
  const [subject, setSubject] = useState<T>();
  const [open, setOpen] = useState(false);
  const show = useCallback((next: T) => {
    setSubject(next);
    setOpen(true);
  }, []);
  return { open, subject, show, onOpenChange: setOpen };
}
