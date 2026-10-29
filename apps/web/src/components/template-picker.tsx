'use client';

import { useQuery } from '@tanstack/react-query';
import { keys, useOptimisticMutation } from '@stint/client';
import type { InvoiceTemplate } from '@stint/schema';
import { api, type Settings } from '@/lib/client/api';
import Image, { type StaticImageData } from 'next/image';
import standard from './template-thumbs/standard.png';
import modern from './template-thumbs/modern.png';
import classic from './template-thumbs/classic.png';
import creative from './template-thumbs/creative.png';

const TEMPLATES: Array<{
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
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  const template = settings?.invoiceTemplate ?? 'standard';
  const choose = useOptimisticMutation({
    queryKey: () => keys.settings(),
    mutationFn: (invoiceTemplate: InvoiceTemplate) =>
      api.updateSettings({ invoiceTemplate }),
    predict: (current: Settings | undefined, invoiceTemplate) =>
      current && { ...current, invoiceTemplate },
  });
  return { template, choose: (t: InvoiceTemplate) => choose.mutate(t) };
}

/* Page 1 of each template's sample PDF, rendered by `pnpm sample:invoice`:
   the thumbnail is the invoice, so the two cannot drift. */
const THUMBS: Record<InvoiceTemplate, StaticImageData> = {
  standard,
  modern,
  classic,
  creative,
};

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
            <Image
              src={THUMBS[t.id]}
              alt=""
              // The rendered size, which Vitest's image import doesn't carry.
              width={400}
              height={518}
              className="h-auto w-full rounded-sm shadow-card"
            />
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
