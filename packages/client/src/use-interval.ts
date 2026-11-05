'use client';

import { useEffect, useState } from 'react';

/** Re-render every `ms` while `active`. */
export function useInterval(active: boolean, ms: number): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
