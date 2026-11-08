'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
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
import { useMissing } from '@/lib/client/use-missing';

/** A flat amount on one invoice: a fee, a deposit, a retainer. */
export interface Charge {
  description: string;
  amount: number;
}

/**
 * Adds or edits one charge on the invoice being made.
 *
 * Local to the form: nothing is saved until the invoice is generated, so
 * Save and Remove answer at once with no server to wait on.
 */
export function ChargeDialog({
  open,
  onOpenChange,
  charge,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent to add one. */
  charge?: Charge;
  onSave: (charge: Charge) => void;
  onRemove?: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const parsed = Number.parseFloat(amount);
  const check = useMissing({
    'charge-description':
      description.trim() === '' ? 'Say what the charge is for.' : undefined,
    'charge-amount':
      Number.isFinite(parsed) && parsed > 0
        ? undefined
        : 'Enter an amount over zero.',
  });

  // Reset each time it opens, so a previous charge cannot linger.
  useEffect(() => {
    if (!open) return;
    setDescription(charge?.description ?? '');
    setAmount(charge ? String(charge.amount) : '');
    check.reset();
  }, [open, charge, check.reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!check.passes()) return;
            onSave({
              description: description.trim(),
              amount: Math.round(parsed * 100) / 100,
            });
            onOpenChange(false);
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{charge ? 'Edit charge' : 'New charge'}</DialogTitle>
            <DialogDescription>
              A flat amount on this invoice, after the time.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Description"
            htmlFor="charge-description"
            required
            error={check.error('charge-description')}
          >
            <Input
              id="charge-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="What is the charge for?"
              required
            />
          </Field>
          <Field
            label="Amount"
            htmlFor="charge-amount"
            required
            error={check.error('charge-amount')}
          >
            <Input
              id="charge-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="type-duration text-right"
              required
            />
          </Field>

          <DialogFooter>
            {/* At the far end from Save, so it is never hit by habit. */}
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  onRemove();
                  onOpenChange(false);
                }}
              >
                <Trash2 aria-hidden strokeWidth={1.75} />
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
