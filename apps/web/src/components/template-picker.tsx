'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keys, useOptimisticMutation } from '@stint/client';
import type { InvoiceTemplate } from '@stint/schema';
import { api, type Settings } from '@/lib/client/api';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';
import Image, { type ImageProps } from 'next/image';
import standard from './template-thumbs/standard.png';
import modern from './template-thumbs/modern.png';
import classic from './template-thumbs/classic.png';
import creative from './template-thumbs/creative.png';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
 * The account's template, and the press on Settings that changes it. The
 * choice shows at once; a refused save puts the saved one back and the
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
   the thumbnail and preview are the invoice, so they cannot drift. */
const THUMBS: Record<InvoiceTemplate, ImageProps['src']> = {
  standard,
  modern,
  classic,
  creative,
};

/** The template's name, as the picker shows it. */
export const templateName = (id: InvoiceTemplate) =>
  TEMPLATES.find((t) => t.id === id)?.name ?? id;

/**
 * The four templates as a radio group of thumbnail cards, with a line on
 * each. Each has a Preview that shows its sample page at full size.
 */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: InvoiceTemplate;
  onChange: (t: InvoiceTemplate) => void;
}) {
  const [previewing, setPreviewing] = useState<InvoiceTemplate | null>(null);
  const shown = TEMPLATES.find((t) => t.id === previewing);
  const scrollerFocus = useScrollerFocus('all');
  return (
    <>
      <div
        role="radiogroup"
        aria-label="Invoice template"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {TEMPLATES.map((t) => (
          <TemplateOption
            key={t.id}
            template={t}
            on={t.id === value}
            onChange={onChange}
            group="invoice-template"
            className="gap-2 bg-surface-elevated p-2"
            thumb={<Sample id={t.id} sizes="200px" />}
          >
            {/* Above the radio, so a press previews without choosing. */}
            <Button
              type="button"
              size="xs"
              variant="default"
              onClick={() => setPreviewing(t.id)}
              aria-label={`Preview ${t.name}`}
              className="relative z-10 self-start"
            >
              Preview
            </Button>
          </TemplateOption>
        ))}
      </div>
      <Dialog
        open={shown !== undefined}
        onOpenChange={(open) => (open ? null : setPreviewing(null))}
      >
        {shown ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{shown.name}</DialogTitle>
              <DialogDescription>{shown.line}</DialogDescription>
            </DialogHeader>
            <div
              tabIndex={scrollerFocus}
              className="max-h-[70vh] overflow-y-auto rounded-sm"
            >
              <Sample
                id={shown.id}
                named
                sizes="(min-width: 640px) 624px, 100vw"
              />
            </div>
            {shown.id === value ? null : (
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    onChange(shown.id);
                    setPreviewing(null);
                  }}
                >
                  Use {shown.name}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

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
        {TEMPLATES.map((t) => (
          <TemplateOption
            key={t.id}
            template={t}
            on={t.id === value}
            onChange={onChange}
            group="invoice-template-choice"
            className="gap-0.5 px-3 py-2.5"
            lineClassName="max-sm:hidden"
          />
        ))}
      </div>
      <div
        tabIndex={scrollerFocus}
        className="max-h-[62vh] overflow-y-auto rounded-sm bg-surface-recessed p-3"
      >
        <Sample id={value} named sizes="(min-width: 640px) 460px, 100vw" />
      </div>
    </div>
  );
}

/**
 * One template as a radio card. Native radios, so arrow keys move the
 * choice as they would in any radio group. The radio covers the card, named
 * by the template alone: a thumbnail is a picture, and its text is not the
 * radio's name.
 */
function TemplateOption({
  template: t,
  on,
  onChange,
  group,
  className,
  lineClassName = '',
  thumb,
  children,
}: {
  template: (typeof TEMPLATES)[number];
  on: boolean;
  onChange: (t: InvoiceTemplate) => void;
  group: string;
  className: string;
  lineClassName?: string;
  thumb?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-md border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-edge-focus ${className} ${
        on
          ? 'border-accent-default ring-1 ring-accent-default'
          : 'border-edge-default hover:bg-surface-hover'
      }`}
    >
      {thumb}
      <span className={`type-control ${on ? 'text-strong' : 'text-muted'}`}>
        {t.name}
      </span>
      <span className={`type-meta text-subtle ${lineClassName}`}>{t.line}</span>
      <input
        type="radio"
        name={group}
        value={t.id}
        checked={on}
        onChange={() => onChange(t.id)}
        aria-label={t.name}
        className="absolute inset-0 cursor-pointer appearance-none rounded-md"
      />
      {children}
    </div>
  );
}

/** A template's sample page; `named` when it is the subject, not a thumbnail. */
function Sample({
  id,
  named = false,
  sizes,
}: {
  id: InvoiceTemplate;
  named?: boolean;
  sizes: string;
}) {
  return (
    <Image
      src={THUMBS[id]}
      alt={named ? `A sample invoice in ${templateName(id)}` : ''}
      // The image's size, which Vitest's image import doesn't carry.
      width={1224}
      height={1584}
      sizes={sizes}
      className="h-auto w-full rounded-sm shadow-card"
    />
  );
}
