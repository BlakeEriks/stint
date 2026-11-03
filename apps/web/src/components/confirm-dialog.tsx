'use client';

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/client/api';

/**
 * A press that can't be taken back, asked in a dialog that says what
 * changes. The server decides it, so the confirm shows a pending state
 * until it answers (Constitution VI), and a refusal stays in the dialog,
 * beside the press that met it. `tone` is the confirm's weight: `primary`
 * for one that locks, `danger` for one that destroys.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  icon,
  keepLabel = 'Keep',
  tone = 'primary',
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What changes, in the user's terms. */
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  icon?: ReactNode;
  keepLabel?: string;
  tone?: 'primary' | 'danger';
  pending: boolean;
  error?: unknown;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      // Pending, it stays: the answer lands here.
      onOpenChange={(next) => !pending && onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="type-support text-danger">
            {error instanceof ApiError
              ? error.message
              : 'That change was rejected.'}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {keepLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'accent'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : icon}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens its own `ConfirmDialog`. Its label and icon are the
    confirm's, so both read as one press; `danger` draws it as a quiet red
    ghost (`.claude/rules/web-ui.md`). */
export function AskFirst({
  press,
  disabled,
  onConfirm,
  ...ask
}: Omit<
  Parameters<typeof ConfirmDialog>[0],
  'open' | 'onOpenChange' | 'pending' | 'error'
> & {
  press: { isPending: boolean; reset: () => void; error: unknown };
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={ask.tone === 'danger' ? 'ghost' : 'default'}
        className={
          ask.tone === 'danger'
            ? 'text-danger hover:bg-danger-muted hover:text-danger'
            : undefined
        }
        disabled={disabled || press.isPending}
        onClick={() => {
          // A refusal from an earlier press must not read as this one's.
          press.reset();
          setAsking(true);
        }}
      >
        {ask.icon}
        {ask.confirmLabel}
      </Button>
      <ConfirmDialog
        {...ask}
        open={asking}
        onOpenChange={setAsking}
        pending={press.isPending}
        error={press.error}
        onConfirm={onConfirm}
      />
    </>
  );
}
