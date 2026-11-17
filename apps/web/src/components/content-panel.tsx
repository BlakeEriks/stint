/**
 * THE PANEL. One surface with a subtle edge and the card's shadow — a step
 * above the rail and dock that flank it, because depth increases toward what
 * is being read. Nothing inside it is a card. At `xl` it is a bounded column
 * whose `Page` scrolls inside it, clipped to its corners.
 */
export function ContentPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-content-panel
      className="relative min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-primary shadow-card xl:col-start-2 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden"
    >
      {children}
    </div>
  );
}
