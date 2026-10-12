'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMediaQuery } from './use-media-query';
import { XL } from './use-scroller-focus';

export type FoldRegion = 'inbox' | 'today';

/**
 * Which of the folded dock's regions is open over the panel, if any.
 *
 * A fold belongs to the screen it was opened on and to the width that has a
 * strip: a navigation, or the window narrowing below `xl` where the full band
 * returns, closes it. It is cleared during render rather than in an effect,
 * so no frame shows a fold over the wrong screen, and coming back finds it
 * closed.
 */
export function useDockFold() {
  const pathname = usePathname();
  const wide = useMediaQuery(XL);
  const [fold, setFold] = useState<{ region: FoldRegion; path: string }>();

  if (fold && (fold.path !== pathname || !wide)) setFold(undefined);

  const open = fold?.path === pathname && wide ? fold.region : null;

  return {
    open,
    setOpen: (region: FoldRegion | null) =>
      setFold(region ? { region, path: pathname } : undefined),
  };
}
