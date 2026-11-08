'use client';

import { useState } from 'react';
import type { InvoiceTemplate } from '@stint/schema';
import { SettingsDialog } from './settings-dialog';
import { TemplatePicker } from './template-picker';

/** The account's invoice template, changed from New invoice. */
export function TemplateDialog({
  onOpenChange,
  template,
}: {
  onOpenChange: (open: boolean) => void;
  template: InvoiceTemplate;
}) {
  const [chosen, setChosen] = useState(template);
  return (
    <SettingsDialog
      onOpenChange={onOpenChange}
      title="Invoice template"
      description="How your invoices look: the type, the layout and the colors. Saved to Settings, for every draft."
      className="sm:max-w-2xl"
      missing={{}}
      patch={() => ({ invoiceTemplate: chosen })}
    >
      {() => <TemplatePicker value={chosen} onChange={setChosen} />}
    </SettingsDialog>
  );
}
