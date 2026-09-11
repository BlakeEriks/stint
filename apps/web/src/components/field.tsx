'use client';

import { Label } from '@/components/ui/label';

const LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-subtle';

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
      {hint ? <p className="text-[12px] text-subtle">{hint}</p> : null}
    </div>
  );
}

/** A titled group of fields inside a floating pane. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge-subtle bg-surface-primary p-5 shadow-card">
      <h2 className="text-[15px] font-medium text-strong">{title}</h2>
      {description ? (
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      ) : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export const inputClass =
  'h-9 w-full rounded-md border border-edge-default bg-transparent px-3 text-[14px] ' +
  'text-strong placeholder:text-subtle outline-none focus-visible:border-edge-focus ' +
  'focus-visible:ring-[3px] focus-visible:ring-edge-focus';

export const textareaClass =
  'w-full rounded-md border border-edge-default bg-transparent px-3 py-2 text-[14px] ' +
  'text-strong placeholder:text-subtle outline-none focus-visible:border-edge-focus ' +
  'focus-visible:ring-[3px] focus-visible:ring-edge-focus';
