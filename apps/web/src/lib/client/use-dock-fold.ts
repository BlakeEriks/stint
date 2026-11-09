'use client';

import { useSyncExternalStore } from 'react';

/** Where the choice is kept; stories set it to draw the folded dock. */
export const FOLD_KEY = 'stint.dock.folded';

/* A device preference, like the dock split and the zoom: it lives in
   `localStorage` and never reaches the server. The dock and its strip read
   it apart, so both hear every write. */
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    /* Private mode: open. */
    return false;
  }
}

function write(folded: boolean) {
  try {
    if (folded) localStorage.setItem(FOLD_KEY, '1');
    else localStorage.removeItem(FOLD_KEY);
  } catch {
    /* Private mode: the choice is lost, and the dock stays open. */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Whether the user has folded the dock to its strip, and the toggle. Open by
 * default and the same on every screen: no screen folds it on its own.
 */
export function useDockFold() {
  /* Open on the server and on first paint, so hydration matches. */
  const folded = useSyncExternalStore(subscribe, read, () => false);
  return { folded, setFolded: write };
}
