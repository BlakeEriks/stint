'use client';

import { useState } from 'react';
import type { InvoiceTemplate } from '@stint/schema';
import { TriggerChevron, triggerClass } from './field';
import { SettingsDialog } from './settings-dialog';
import { TemplateChooser, templateName } from './template-picker';

/** The account's template by name, changed in a dialog: on New invoice it
    is a setting, not a field of the draft. */
export function TemplateControl({
  id,
  template,
}: {
  id: string;
  template: InvoiceTemplate;
}) {
  const [changing, setChanging] = useState(false);
  return (
    <>
      <button
        type="button"
        id={id}
        className={triggerClass}
        onClick={() => setChanging(true)}
      >
        <span className="truncate">{templateName(template)}</span>
        <TriggerChevron />
      </button>
      {changing ? (
        <TemplateDialog onOpenChange={setChanging} template={template} />
      ) : null}
    </>
  );
}

/** The account's invoice template, saved on Save. */
function TemplateDialog({
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
      description="How your invoices look: the type, the layout and the colors. Every draft uses it."
      className="sm:max-w-3xl"
      missing={{}}
      patch={() => ({ invoiceTemplate: chosen })}
    >
      {() => <TemplateChooser value={chosen} onChange={setChosen} />}
    </SettingsDialog>
  );
}
