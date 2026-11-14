'use client';

import type { InvoiceTemplate } from '@stint/schema';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';
import Image, { type ImageProps } from 'next/image';
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

/* Page 1 of each template's sample PDF, rendered by `pnpm sample:invoice`:
   the sample is the invoice, so it cannot drift. */
const THUMBS: Record<InvoiceTemplate, ImageProps['src']> = {
  standard,
  modern,
  classic,
  creative,
};

/** The template's name, as the chooser shows it. */
export const templateName = (id: InvoiceTemplate) =>
  TEMPLATES.find((t) => t.id === id)?.name ?? id;

/**
 * The four templates by name and line, beside a large sample page of the
 * chosen one, which swaps in place.
 */
export function TemplateChooser({
  value,
  onChange,
}: {
  value: InvoiceTemplate;
  onChange: (t: InvoiceTemplate) => void;
}) {
  const scrollerFocus = useScrollerFocus('all');
  return (
    <div className="grid items-start gap-4 sm:grid-cols-[13.75rem_1fr]">
      <div
        role="radiogroup"
        aria-label="Invoice template"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-1"
      >
        {/* Native radios, so arrow keys move the choice as in any radio
            group; each covers its card. */}
        {TEMPLATES.map((t) => {
          const on = t.id === value;
          return (
            <div
              key={t.id}
              className={`relative flex flex-col gap-0.5 rounded-md border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-edge-focus ${
                on
                  ? 'border-accent-default ring-1 ring-accent-default'
                  : 'border-edge-default hover:bg-surface-hover'
              }`}
            >
              <span
                className={`type-control ${on ? 'text-strong' : 'text-muted'}`}
              >
                {t.name}
              </span>
              <span className="type-meta text-subtle max-sm:hidden">
                {t.line}
              </span>
              <input
                type="radio"
                name="invoice-template"
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
      <div
        tabIndex={scrollerFocus}
        className="max-h-[62vh] overflow-y-auto rounded-sm bg-surface-recessed p-3"
      >
        <Image
          src={THUMBS[value]}
          alt={`A sample invoice in ${templateName(value)}`}
          // The image's size, which Vitest's image import doesn't carry.
          width={1224}
          height={1584}
          sizes="(min-width: 640px) 460px, 100vw"
          className="h-auto w-full rounded-sm shadow-card"
        />
      </div>
    </div>
  );
}
