'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * A dialog the user walks through: one bar per step, filled through the
 * current one, and "Step n of m" beside them.
 *
 * No close button, and Escape and a press outside do nothing: each step has
 * its own way out, so the dialog is never lost to a stray click.
 */
export function StepDialog({
  open,
  step,
  steps,
  children,
}: {
  open: boolean;
  step: number;
  steps: number;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="gap-5 sm:max-w-[460px]"
      >
        <div className="flex items-center gap-2.5">
          <div aria-hidden className="flex gap-1">
            {Array.from({ length: steps }, (_, i) => (
              <span
                key={i}
                className={`h-[3px] w-[22px] rounded-full ${
                  i < step ? 'bg-strong' : 'bg-edge-default'
                }`}
              />
            ))}
          </div>
          <span className="type-meta text-subtle">
            Step {step} of {steps}
          </span>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
