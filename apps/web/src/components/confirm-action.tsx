'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/** The row of a `takesRow` confirm: its other controls hide while it asks,
    without their transition, which would hold each visible for its length. */
export const confirmRow =
  'has-[[data-asking]]:*:not-[[data-asking]]:invisible has-[[data-asking]]:*:transition-none';

/**
 * A destructive action in two presses (`.claude/rules/web-ui.md`): a quiet red
 * ghost that only asks, then a filled `destructive` naming what goes, with a
 * ghost Keep beside it. In place rather than a modal: a confirm modal is
 * dismissed unread, and the entry dialog would stack one dialog on another.
 * Where the pair would wrap its row, `takesRow` draws it over the trigger's
 * slot and the row (`confirmRow`) hides its other controls until Keep, so
 * nothing moves.
 *
 * The pressed button unmounts or goes inert as the confirm replaces it, so
 * focus is handed over explicitly. Otherwise a keyboard or screen-reader user
 * lands on the page body. Keep hands it back.
 */
export function ConfirmAction({
  children,
  label,
  pendingLabel,
  consequence,
  pending,
  disabled,
  onConfirm,
  className,
  takesRow,
  'aria-label': ariaLabel,
}: {
  /** The first step's content: a glyph, and its label unless icon-only. */
  children: ReactNode;
  label: string;
  pendingLabel: string;
  /** One line floating under the confirm. */
  consequence?: string;
  pending: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
  takesRow?: boolean;
  'aria-label'?: string;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const swapped = useRef(false);
  const describedBy = useId();

  useEffect(() => {
    // Not on mount: only a swap moves focus.
    if (!swapped.current) {
      swapped.current = true;
      return;
    }
    (asking ? confirm : trigger).current?.focus();
  }, [asking]);

  const first = (
    <Button
      ref={trigger}
      type="button"
      variant="ghost"
      size={ariaLabel ? 'icon' : 'default'}
      aria-label={ariaLabel}
      aria-hidden={asking || undefined}
      inert={asking}
      className={cn(
        'text-danger hover:bg-danger-muted hover:text-danger',
        asking && 'invisible',
        // A visibility transition would hold it hidden as Keep focuses it.
        takesRow && 'transition-none',
        !takesRow && className,
      )}
      disabled={disabled || pending}
      onClick={() => setAsking(true)}
    >
      {children}
    </Button>
  );
  if (!asking && !takesRow) return first;

  const pair = asking ? (
    <span
      className={cn(
        'flex items-center gap-2',
        // No insets: drawn where the trigger sits, over the row it hid.
        takesRow ? 'absolute' : cn('relative', className),
      )}
    >
      <Button
        ref={confirm}
        type="button"
        variant="destructive"
        aria-describedby={consequence ? describedBy : undefined}
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
      {/* Floats under the pair: a line of its own would wrap the row. */}
      {consequence ? (
        <span
          id={describedBy}
          className="absolute top-full left-0 z-10 mt-1.5 w-max max-w-xs rounded-md border bg-surface-elevated px-2.5 py-1.5 type-support text-muted shadow-md"
        >
          {consequence}
        </span>
      ) : null}
    </span>
  ) : null;
  if (!takesRow) return pair;

  // The trigger stays, hidden, so the row keeps its width.
  return (
    <span data-asking={asking || undefined} className={cn('flex', className)}>
      {pair}
      {first}
    </span>
  );
}
