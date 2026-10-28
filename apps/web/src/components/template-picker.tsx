'use client';

import { useQuery } from '@tanstack/react-query';
import { keys, useOptimisticMutation } from '@stint/client';
import type { InvoiceTemplate } from '@stint/schema';
import { api, type Settings } from '@/lib/client/api';
import { InvoicePaper, type PaperInvoice } from './invoice-paper';

export const TEMPLATES: Array<{
  id: InvoiceTemplate;
  name: string;
  line: string;
}> = [
  {
    id: 'standard',
    name: 'Standard',
    line: 'Clean and balanced. The default.',
  },
  {
    id: 'modern',
    name: 'Modern',
    line: 'Outfit, clean lines, a touch of green.',
  },
  { id: 'classic', name: 'Classic', line: 'Garamond, like a book’s foreword.' },
  {
    id: 'creative',
    name: 'Creative',
    line: 'Shapes, rings and a ticket stub.',
  },
];

/**
 * The account's template, and the press that changes it. Settings and New
 * invoice both use this, so the two can never disagree: it is one setting.
 * The choice shows at once; a refused save puts the saved one back and the
 * app-wide notice says why.
 */
export function useTemplateChoice() {
  const template = useChosenTemplate();
  const choose = useOptimisticMutation({
    queryKey: () => keys.settings(),
    mutationFn: (invoiceTemplate: InvoiceTemplate) =>
      api.updateSettings({ invoiceTemplate }),
    predict: (current: Settings | undefined, invoiceTemplate) =>
      current && { ...current, invoiceTemplate },
  });
  return { template, choose: (t: InvoiceTemplate) => choose.mutate(t) };
}

/** The template a draft renders in. */
export function useChosenTemplate(): InvoiceTemplate {
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  return settings?.invoiceTemplate ?? 'standard';
}

/** What every thumbnail draws: one invoice, so they compare like for like. */
export const SAMPLE: PaperInvoice = {
  number: 'INV-0015',
  issued: '2026-10-01',
  due: '2026-10-31',
  period: { start: '2026-09-01', end: '2026-09-30' },
  reference: 'ICA dated Aug 5, 2026 · Exhibit A SOW',
  business: {
    name: 'Sam Rivera',
    address: '1200 Pine St, Suite 4\nSeattle, WA 98101',
    email: 'billing@samrivera.test',
  },
  client: {
    name: 'Northwind Trading',
    address: '400 Market St\nSan Francisco, CA 94105',
    email: 'ap@northwind.test',
  },
  lines: [
    {
      description: 'Warehouse dashboard',
      unit: 'hour',
      quantity: 32.5,
      unitPrice: 150,
      amount: 4875,
    },
    {
      description: 'Rush: peak season fixes',
      unit: 'hour',
      quantity: 12,
      unitPrice: 195,
      amount: 2340,
    },
    {
      description: 'Monthly retainer',
      unit: 'fixed',
      quantity: 1,
      unitPrice: 500,
      amount: 500,
    },
    {
      description: 'Hosting, September',
      unit: 'expense',
      quantity: 1,
      unitPrice: 84,
      amount: 84,
      spentOn: '2026-09-12',
    },
  ],
  subtotal: 7715,
  taxRate: 0,
  taxAmount: 0,
  expensesSubtotal: 84,
  total: 7799,
  currency: 'USD',
  terms: 'Net 30',
  payment: {
    title: 'Business checking',
    fields: [
      { label: 'Bank', value: 'First Federal Bank' },
      { label: 'Account holder', value: 'Sam Rivera' },
      { label: 'Routing number', value: '011000015' },
      { label: 'Account number', value: '000123456789' },
    ],
    intermediary: [],
    link: null,
    notes: null,
  },
  notes: 'Thank you for the work this month.',
};

function Thumb({ template }: { template: InvoiceTemplate }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none aspect-[612/792] overflow-hidden rounded-sm shadow-card"
    >
      <InvoicePaper template={template} invoice={SAMPLE} />
    </div>
  );
}

/**
 * The four templates as a radio group of thumbnails: cards with a line on
 * each in Settings, small ones on New invoice. Native radios, so arrow keys
 * move the choice as they would in any radio group.
 */
export function TemplatePicker({
  value,
  onChange,
  size,
}: {
  value: InvoiceTemplate;
  onChange: (t: InvoiceTemplate) => void;
  size: 'card' | 'mini';
}) {
  const card = size === 'card';
  return (
    <div
      role="radiogroup"
      aria-label="Invoice template"
      className={`grid gap-3 ${card ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4 gap-2'}`}
    >
      {TEMPLATES.map((t) => {
        const on = t.id === value;
        return (
          /* The radio covers the card, named by the template alone: the
             thumbnail is a picture, and its text is not the radio's name. */
          <div
            key={t.id}
            className={`relative flex flex-col rounded-md border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-edge-focus ${
              on
                ? 'border-accent-default ring-1 ring-accent-default'
                : 'border-edge-default hover:bg-surface-hover'
            } ${card ? 'gap-2 bg-surface-elevated p-2' : 'gap-1 p-1'}`}
          >
            <Thumb template={t.id} />
            <span
              className={`${card ? 'type-control' : 'type-meta text-center'} ${on ? 'text-strong' : 'text-muted'}`}
            >
              {t.name}
            </span>
            {card ? (
              <span className="type-meta text-subtle">{t.line}</span>
            ) : null}
            <input
              type="radio"
              name={`invoice-template-${size}`}
              value={t.id}
              checked={on}
              onChange={() => onChange(t.id)}
              aria-label={t.name}
              className="absolute inset-0 cursor-pointer appearance-none rounded-md"
            />
          </div>
        );
      })}
    </div>
  );
}
