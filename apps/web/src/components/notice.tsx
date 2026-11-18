import type { ReactNode } from 'react';

/**
 * A banner saying something about the screen that isn't part of it: a title,
 * an optional line under it, and an optional action at its end. The edge is
 * the hue the Inbox ranks a fault with; `danger` is for what blocks a save.
 */
export function Notice({
  id,
  role = 'status',
  tone = 'warning',
  title,
  detail,
  action,
}: {
  id?: string;
  role?: 'status' | 'alert';
  tone?: 'warning' | 'danger';
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      id={id}
      role={role}
      className={`flex items-center justify-between gap-3 rounded-lg border border-l-2 border-edge-default px-3 py-2.5 ${tone === 'danger' ? 'border-l-danger' : 'border-l-warning'}`}
    >
      <div className="min-w-0">
        <p className="type-control text-strong">{title}</p>
        {detail ? <p className="type-support text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}
