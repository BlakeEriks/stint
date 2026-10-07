'use client';

import { useScrollerFocus } from '@/lib/client/use-scroller-focus';

/** A region that may scroll at any width, for a server-rendered page. */
export function ScrollRegion(props: React.ComponentProps<'section'>) {
  return <section {...props} tabIndex={useScrollerFocus('all')} />;
}
