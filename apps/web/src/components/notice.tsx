import type { ReactNode } from 'react';

/**
 * A banner saying something about the screen that isn't part of it. The edge
 * is the hue the Inbox ranks a fault with: `danger` for an error, something
 * entered wrong or refused by the server, `warning` for a condition to see to.
 * `className` places it, never restyles it.
 */
export function Notice({
  id,
  role = 'status',
  tone = 'warning',
  title,
  detail,
  action,
  children,
  className = '',
}: {
  id?: string;
  role?: 'status' | 'alert';
  tone?: 'warning' | 'danger';
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      role={role}
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-l-2 border-edge-default px-3 py-2.5 ${tone === 'danger' ? 'border-l-danger' : 'border-l-warning'} ${className}`}
    >
      <div className="min-w-0">
        <p className="type-control text-strong">{title}</p>
        {detail ? <p className="type-support text-muted">{detail}</p> : null}
        {children}
      </div>
      {action}
    </div>
  );
}
