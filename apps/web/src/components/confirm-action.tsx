'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * A destructive action in two presses (`.claude/rules/web-ui.md`): a quiet red
 * ghost that only asks, then a filled `destructive` naming what goes, with a
 * ghost Keep beside it. In place rather than a modal: it sits in a dialog's
 * footer, and a modal would stack one dialog on another.
 *
 * The pressed button unmounts as the confirm replaces it, so focus
 * is handed over explicitly. Otherwise a keyboard or screen-reader user
 * lands on the page body. Keep hands it back.
 */
export function ConfirmAction({
  children,
  label,
  pendingLabel,
  pending,
  disabled,
  onConfirm,
  className,
  'aria-label': ariaLabel,
}: {
  /** The first step's content: a glyph, and its label unless icon-only. */
  children: ReactNode;
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
  'aria-label'?: string;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const swapped = useRef(false);

  useEffect(() => {
    // Not on mount: only a swap moves focus.
    if (!swapped.current) {
      swapped.current = true;
      return;
    }
    (asking ? confirm : trigger).current?.focus();
  }, [asking]);

  /* A press that stops pending while this is still mounted failed: a success
     removes it. The row comes back beside the error. */
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) setAsking(false);
    wasPending.current = pending;
  }, [pending]);

  const first = (
    <Button
      ref={trigger}
      type="button"
      variant="ghost"
      size={ariaLabel ? 'icon' : 'default'}
      aria-label={ariaLabel}
      className={cn(
        'text-danger hover:bg-danger-muted hover:text-danger',
        className,
      )}
      disabled={disabled || pending}
      onClick={() => setAsking(true)}
    >
      {children}
    </Button>
  );
  if (!asking) return first;

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Button
        ref={confirm}
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {pending ? pendingLabel : label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => setAsking(false)}
      >
        Keep
      </Button>
    </span>
  );
}
