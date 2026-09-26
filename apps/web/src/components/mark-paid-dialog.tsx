'use client';

import { useEffect, useState } from 'react';
import { DollarSign, Loader2 } from 'lucide-react';
import { localDateKey, localDateTimeToInstant } from '@stint/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from './field';
import { timeZone } from '@/lib/client/use-timer';

/**
 * When money actually arrived, not when the invoice happened to get opened.
 *
 * Defaults to today because most invoices are marked paid the day the
 * payment lands, but a client that paid earlier — or a backlog worked
 * through days later — needs the real date, not the click.
 */
export function MarkPaidDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `undefined` for the unchanged default (today) — the server's `now()`
   * then applies, matching the original behaviour for the common case
   * instead of racing it with a local-midnight instant that can land
   * before `sent_at` on the same day.
   */
  onConfirm: (paidAt: string | undefined) => void;
  pending: boolean;
  error?: unknown;
}) {
  const [date, setDate] = useState('');
  const [today, setToday] = useState('');

  // Reset to today each time it opens, so a previous pick cannot linger.
  useEffect(() => {
    if (!open) return;
    const key = localDateKey(new Date(), timeZone);
    setDate(key);
    setToday(key);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    if (date === today) {
      onConfirm(undefined);
      return;
    }
    const paidAt = localDateTimeToInstant(date, '00:00', timeZone);
    onConfirm(paidAt.toISOString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Mark paid</DialogTitle>
            <DialogDescription>
              When did the payment actually arrive?
            </DialogDescription>
          </DialogHeader>

          <Field label="Date paid" htmlFor="paid-at">
            <Input
              id="paid-at"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={today}
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="type-support text-danger">
              That change was rejected.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={pending || !date}>
              {pending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <DollarSign aria-hidden strokeWidth={1.75} />
              )}
              Mark paid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
