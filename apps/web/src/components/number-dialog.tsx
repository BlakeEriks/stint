'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Settings } from '@/lib/client/api';
import { Field } from './field';
import { SettingsDialog } from './settings-dialog';

/**
 * The number the next invoice takes, moved from New invoice. The server
 * refuses a step back, or one past the ceiling, and the dialog says why.
 */
export function NumberDialog({
  onOpenChange,
  settings,
}: {
  onOpenChange: (open: boolean) => void;
  settings: Settings;
}) {
  const [next, setNext] = useState(String(settings.nextInvoiceNumber));
  const [prefix, setPrefix] = useState(settings.invoiceNumberPrefix);
  const number = Number(next);

  return (
    <SettingsDialog
      onOpenChange={onOpenChange}
      title="Invoice number"
      description="Saved to Settings, for every invoice after this one."
      ready={next !== '' && Number.isInteger(number) && number > 0}
      patch={() => ({ nextInvoiceNumber: number, invoiceNumberPrefix: prefix })}
    >
      {(pending) => (
        <div className="flex flex-wrap gap-4">
          <Field
            label="Next number"
            htmlFor="number-dialog-next"
            hint="It only moves forward."
            className="flex-1 basis-40"
          >
            {/* No min or max: the browser would block the submit with its own
                message, where the server's says why. */}
            <Input
              id="number-dialog-next"
              type="number"
              autoFocus
              value={next}
              readOnly={pending}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field
            label="Prefix"
            htmlFor="number-dialog-prefix"
            className="flex-1 basis-40"
          >
            <Input
              id="number-dialog-prefix"
              placeholder="INV-"
              maxLength={20}
              value={prefix}
              readOnly={pending}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </Field>
        </div>
      )}
    </SettingsDialog>
  );
}
