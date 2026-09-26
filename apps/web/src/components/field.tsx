'use client';

import { useCallback } from 'react';
import { Label } from '@/components/ui/label';

const LABEL = 'type-label text-subtle';

/** One labeled control with an optional hint. Shared by every form. */
export function Field({
  label,
  hint,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={htmlFor} className={LABEL}>
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="type-support text-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * Bring a linked-to section into view and put the caret in its first field.
 *
 * The content column scrolls inside itself rather than the page scrolling, and
 * a native anchor jump does not reach an element inside a nested scroll
 * container — `/settings#goal` arrived with the card still below the fold.
 *
 * Focus is the other half: arriving from another screen should leave the user
 * in the field the link was about, not at the top of the document.
 * `preventScroll`, because the scroll above already placed the card and
 * letting focus scroll again would fight it.
 */
function focusSection(section: HTMLElement) {
  section.scrollIntoView({ block: 'start' });

  const field = section.querySelector<HTMLElement>(
    'input:not([type="hidden"]), select, textarea',
  );
  if (!field) return;

  field.focus({ preventScroll: true });

  /* Selecting means typing replaces the value the user came to change rather
     than appending to it. A number input reports a null `selectionStart` and
     still selects, so this is guarded by type rather than by capability. */
  if (
    field instanceof HTMLInputElement &&
    field.type !== 'checkbox' &&
    field.type !== 'radio'
  ) {
    field.select();
  }
}

/**
 * A titled group of fields: a region of the panel, under an inset rule.
 *
 * No border, no background, no shadow — the panel carries those, and a second
 * set inside it reads as a card in a card.
 *
 * `status` renders top-right. Each section saves independently, so the
 * indicator belongs to the section whose fields are actually in flight rather
 * than to the page.
 */
export function Section({
  id,
  title,
  description,
  status,
  children,
}: {
  /** Anchor target, so another screen can link straight to this section. */
  id?: string;
  title: string;
  description?: string;
  status?: React.ReactNode;
  children?: React.ReactNode;
}) {
  /* A callback ref rather than `useRef` + an effect keyed on `id`: the form
     renders "Loading…" until settings arrive, so on a cold load of
     `/settings#goal` an effect would fire before this section exists and find
     nothing to focus. A callback ref runs when the node actually mounts. */
  const onMount = useCallback(
    (section: HTMLElement | null) => {
      if (!section || !id || typeof window === 'undefined') return;
      if (window.location.hash !== `#${id}`) return;
      focusSection(section);
    },
    [id],
  );

  return (
    <section
      id={id}
      ref={onMount}
      /* `scroll-mt` keeps a little air above the section when it is jumped
         to, so it does not sit flush against the top of the column. */
      className="scroll-mt-4 border-t border-edge-subtle py-[18px] last:pb-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-heading text-strong">{title}</h2>
          {description ? (
            <p className="mt-1 type-support text-muted">{description}</p>
          ) : null}
        </div>
        {status ? <div className="flex-none pt-1">{status}</div> : null}
      </div>
      {children ? (
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      ) : null}
    </section>
  );
}

export const inputClass =
  'h-9 w-full rounded-md border border-edge-default bg-transparent px-3 type-control ' +
  'text-strong placeholder:text-subtle outline-none focus-visible:border-edge-focus ' +
  'focus-visible:ring-[3px] focus-visible:ring-edge-focus';

export const textareaClass =
  'w-full rounded-md border border-edge-default bg-transparent px-3 py-2 type-control ' +
  'text-strong placeholder:text-subtle outline-none focus-visible:border-edge-focus ' +
  'focus-visible:ring-[3px] focus-visible:ring-edge-focus';
