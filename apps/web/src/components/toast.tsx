'use client';

import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Check, X } from 'lucide-react';
import { Toast as Radix } from 'radix-ui';

/** How long each tone stays, in ms: a refusal has more to read. */
const DURATION = { success: 4000, refusal: 10_000 } as const;

/**
 * Where every toast rises: bottom center, clear of the timer dock, whose
 * top sits up to 77px above the bottom edge. `Providers` mounts it once, so
 * two toasts at once stack.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Radix.Provider swipeDirection="down">
      {children}
      <Radix.Viewport className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 m-0 flex list-none flex-col items-center gap-2 px-4 outline-none" />
    </Radix.Provider>
  );
}

/**
 * One message in `ToastProvider`. A refusal keeps a dismiss; both close on
 * their own, and the bar along the bottom shows how long is left.
 */
export function Toast({
  tone,
  open,
  onOpenChange,
  children,
}: {
  tone: keyof typeof DURATION;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  /* The bar is the only clock: Radix starts no timer for a toast that opens
     while the viewport is paused, so its own timer would outlast the bar.
     Radix also pauses on window blur and a hover over the viewport, so the
     bar follows its pause rather than a CSS `:hover` that would drift. */
  const ref = useRef<HTMLLIElement>(null);
  const [paused, setPaused] = useState(false);
  const refusal = tone === 'refusal';

  /* Each open starts from Radix's pause conditions, which it signals only
     on a change. A window focus rechecks them: Radix sends no resume for a
     blur that came before this toast. */
  useLayoutEffect(() => {
    if (!open) return;
    const check = () =>
      setPaused(
        !document.hasFocus() ||
          !!ref.current?.parentElement?.matches(':hover, :focus-within'),
      );
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [open]);

  return (
    <Radix.Root
      ref={ref}
      open={open}
      onOpenChange={onOpenChange}
      duration={Infinity}
      type={refusal ? 'foreground' : 'background'}
      onPause={() => setPaused(true)}
      onResume={() => setPaused(false)}
      data-paused={paused || undefined}
      style={{ '--toast-duration': `${DURATION[tone]}ms` } as CSSProperties}
      className="toast pointer-events-auto relative flex w-fit max-w-[400px] items-center gap-3 overflow-hidden rounded-[10px] border border-edge-subtle bg-surface-elevated px-3.5 py-3 shadow-float"
    >
      <span
        aria-hidden
        className={`grid size-6 flex-none place-items-center rounded-full type-control ${
          refusal
            ? 'bg-danger-muted text-danger'
            : 'bg-accent-muted text-success'
        }`}
      >
        {refusal ? '!' : <Check className="size-3.5" strokeWidth={2.5} />}
      </span>
      <Radix.Description className="type-control text-strong">
        {children}
      </Radix.Description>
      {refusal ? (
        <Radix.Close
          aria-label="Dismiss"
          className="flex-none text-subtle hover:text-primary"
        >
          <X aria-hidden className="size-4" strokeWidth={1.75} />
        </Radix.Close>
      ) : null}
      <span
        aria-hidden
        className={`toast-left absolute inset-x-0 bottom-0 h-0.5 ${
          refusal ? 'bg-danger' : 'bg-success'
        }`}
        onAnimationEnd={() => onOpenChange(false)}
      />
    </Radix.Root>
  );
}
