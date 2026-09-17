import type * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * A keycap. Hand-written rather than vendored: shadcn has no such shape, and
 * the one thing it must not do is look like a control — it states a key, it
 * does not take a click.
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        `inline-grid h-[18px] min-w-[18px] flex-none place-items-center rounded-[4px]
         border border-edge-default bg-surface-base px-[5px]
         type-badge leading-none text-muted`,
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
