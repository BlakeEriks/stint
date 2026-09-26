'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { LINKS } from './nav';

/**
 * Where the reader has been, this tab: the page before this one, and the last
 * section (a rail entry, filter included) they were on.
 *
 * A reload starts it empty, so a detail page opened cold falls back to where
 * its record sits.
 */
type Trail = {
  current: string | null;
  previous: string | null;
  section: string | null;
};

const EMPTY: Trail = { current: null, previous: null, section: null };
let trail = EMPTY;
const listeners = new Set<() => void>();

/* Module scope, so `useSyncExternalStore` sees one identity and subscribes
   once rather than on every render. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => trail;
const serverSnapshot = () => EMPTY;

const isSection = (url: string) =>
  LINKS.some((l) => l.href === url.split('?')[0]);

function advance(t: Trail, url: string): Trail {
  if (t.current === url) return t;
  return {
    current: url,
    previous: t.current,
    section: t.current && isSection(t.current) ? t.current : t.section,
  };
}

/** Records each page the app shows. Mounted once, in the app layout. */
export function BackTrail() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    trail = advance(trail, query ? `${pathname}?${query}` : pathname);
    for (const l of listeners) l();
  }, [pathname, query]);
  return null;
}

/** Only for tests, which share the module across cases. */
export function resetBackTrail() {
  trail = EMPTY;
}

/**
 * Back to the section the reader came from, filter intact — or to `up`, where
 * the record sits, when they came from there or from outside the app.
 *
 * A section rather than the page before: a record reached through its own
 * form (new, edit) goes back past the form to the list it started from.
 */
export function BackLink({ up, label }: { up: string; label: string }) {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  /* The trail records after this page renders, so on arrival it still ends
     at the page before. */
  const { previous, section } = advance(stored, pathname);

  const to =
    previous === up || !section
      ? { href: up, label }
      : {
          href: section,
          label: LINKS.find((l) => l.href === section.split('?')[0])!.label,
        };

  return (
    <Link href={to.href} className="type-label text-subtle hover:text-muted">
      ← {to.label}
    </Link>
  );
}
