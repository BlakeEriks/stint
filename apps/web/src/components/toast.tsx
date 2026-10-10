import type { ReactNode } from 'react';

/** The bottom-center strip a short message rises in, for the whole app. */
export function ToastRegion({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {children}
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-edge-default bg-surface-elevated px-4 py-2 type-support text-primary shadow-float">
      {children}
    </div>
  );
}
