'use client';

import { useEffect, useState } from 'react';

/**
 * Holds leaving a page while `changed`: a press on an in-app link is kept
 * from navigating and its href returned as `leaving`, for the page to ask
 * about; a refresh or a closed tab gets the browser's own prompt. The App
 * Router has no way to block a navigation, so the hold is a click listener
 * on `document` in the capture phase, which runs before React's and so
 * before `next/link` navigates.
 */
export function useLeaveGuard(changed: boolean) {
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (!changed) return;
    const click = (e: MouseEvent) => {
      const href = heldHref(e);
      if (href === null) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(href);
    };
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [changed]);
  return { leaving, stay: () => setLeaving(null) };
}

/** The in-app page a click would open in this tab, else null: a new tab,
 *  a download or another site leaves nothing here unseen (another site
 *  unloads, which the browser asks about). */
function heldHref(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return null;
  const a = (e.target as Element | null)?.closest?.('a[href]');
  if (!(a instanceof HTMLAnchorElement)) return null;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download'))
    return null;
  const to = new URL(a.href);
  const here = window.location;
  if (to.origin !== here.origin) return null;
  if (to.pathname === here.pathname && to.search === here.search) return null;
  return to.pathname + to.search + to.hash;
}
