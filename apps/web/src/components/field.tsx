'use client';

import { useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';

const LABEL = 'type-label text-subtle';

/** One labelled control with an optional hint. Shared by every form. */
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
 * A titled group of fields inside a floating pane.
 *
 * `status` renders top-right. Each card saves independently, so the
 * indicator belongs to the card whose fields are actually in flight rather
 * than to the page.
 */
export function Section({
  id,
  title,
  description,
  status,
  children,
}: {
  /** Anchor target, so another screen can link straight to this card. */
  id?: string;
  title: string;
  description?: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  /* The content column scrolls inside itself rather than the page scrolling,
     and a native anchor jump does not reach an element inside a nested scroll
     container on a client-side navigation — `/settings#goal` arrived with the
     card still below the fold. Scrolling it in explicitly is what makes the
     link land. */
  useEffect(() => {
    if (!id || typeof window === 'undefined') return;
    if (window.location.hash !== `#${id}`) return;
    ref.current?.scrollIntoView({ block: 'start' });
  }, [id]);

  return (
    <section
      id={id}
      ref={ref}
      /* `scroll-mt` keeps a little air above the card when it is jumped to,
         so it does not sit flush against the top of the column. */
      className="scroll-mt-4 rounded-xl border border-edge-subtle bg-surface-elevated p-5 shadow-card"
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
      <div className="mt-4 flex flex-col gap-4">{children}</div>
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
