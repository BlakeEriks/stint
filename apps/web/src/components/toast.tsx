'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Portal } from 'radix-ui';

const REGION = 'toasts';

/**
 * Where every toast rises: bottom center. `MutationNotice` mounts it, once,
 * so two toasts at once stack instead of covering each other.
 */
export function ToastRegion({ children }: { children?: ReactNode }) {
  return (
    <div
      id={REGION}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {children}
    </div>
  );
}

const card =
  'pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-edge-default bg-surface-elevated px-4 py-2 type-support text-primary shadow-float';

/** A message inside `ToastRegion`, rendered there directly. */
export function Toast({ children }: { children: ReactNode }) {
  return <div className={card}>{children}</div>;
}

/** A message from anywhere else in the tree, sent into `ToastRegion`. */
export function PortalToast({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<HTMLElement | null>(null);
  useEffect(() => setRegion(document.getElementById(REGION)), []);
  return region ? (
    <Portal.Root container={region}>
      <Toast>{children}</Toast>
    </Portal.Root>
  ) : null;
}
