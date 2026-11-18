/** A warning about an invoice's work: a bold line, then what it means. */
export function Notice({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col gap-0.5 rounded-md border border-edge-default border-l-[3px] border-l-warning bg-surface-elevated px-3.5 py-3 ${className}`}
    >
      {children}
    </div>
  );
}
