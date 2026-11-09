'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/client/api';
import { Field } from './field';
import { shortDate } from './invoice-bits';
import { SettingsDialog } from './settings-dialog';

/**
 * The invoice's No., Issued and Due, opened from where they print. The
 * number is the account's next, saved to Settings; the server refuses one an
 * invoice holds, or one past the ceiling, and the dialog says why. Due is
 * this invoice's alone. A draft keeps its own number, so `settings` is
 * absent there and only Due changes.
 */
export function InvoiceDatesDialog({
  onOpenChange,
  settings,
  number,
  issued,
  due,
  onDue,
}: {
  onOpenChange: (open: boolean) => void;
  settings: Settings | undefined;
  number: string;
  issued: string;
  due: string;
  onDue: (due: string) => void;
}) {
  const [next, setNext] = useState(String(settings?.nextInvoiceNumber ?? ''));
  const [prefix, setPrefix] = useState(settings?.invoiceNumberPrefix ?? '');
  const [dueDate, setDueDate] = useState(due);
  const nextNumber = Number(next);
  const renumbered =
    settings !== undefined &&
    (nextNumber !== settings.nextInvoiceNumber ||
      prefix !== settings.invoiceNumberPrefix);

  return (
    <SettingsDialog
      onOpenChange={onOpenChange}
      title="Number and dates"
      description="Issued is the day the invoice is generated."
      missing={{
        'inv-next':
          !settings || (Number.isInteger(nextNumber) && nextNumber > 0)
            ? undefined
            : 'Enter a whole number over zero.',
        'inv-due': dueError(dueDate, issued),
      }}
      patch={() =>
        renumbered
          ? { nextInvoiceNumber: nextNumber, invoiceNumberPrefix: prefix }
          : null
      }
      onSaved={() => onDue(dueDate)}
    >
      {(pending, error) => (
        <>
          {settings ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Field
                label="Prefix"
                htmlFor="inv-prefix"
                className="flex-1 basis-40"
              >
                <Input
                  id="inv-prefix"
                  placeholder="INV-"
                  maxLength={20}
                  value={prefix}
                  readOnly={pending}
                  onChange={(e) => setPrefix(e.target.value)}
                />
              </Field>
              <Field
                label="Next number"
                htmlFor="inv-next"
                className="flex-1 basis-40"
                error={error('inv-next')}
              >
                <Input
                  id="inv-next"
                  type="number"
                  value={next}
                  readOnly={pending}
                  onChange={(e) => setNext(e.target.value)}
                />
              </Field>
              <p className="basis-full type-support text-subtle">
                Your account's next number, saved to Settings for every invoice
                after this one.
              </p>
            </div>
          ) : (
            <Read label="No." value={number} />
          )}
          <Read label="Issued" value={shortDate(issued)} />
          <Field
            label="Due"
            htmlFor="inv-due"
            hint="For this invoice only."
            error={error('inv-due')}
          >
            <Input
              id="inv-due"
              type="date"
              value={dueDate}
              readOnly={pending}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </>
      )}
    </SettingsDialog>
  );
}

function dueError(due: string, issued: string) {
  if (due === '') return 'Enter a due date.';
  if (due < issued) return "Due can't be before the issue date.";
  return undefined;
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-label text-subtle">{label}</span>
      <span className="type-control text-strong">{value}</span>
    </div>
  );
}
