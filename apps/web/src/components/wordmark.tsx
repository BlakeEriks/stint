/**
 * `|Stint|` — the wordmark.
 *
 * The bounds carry the meaning the letters cannot: a stint is work with a
 * start and an end, which is also what the calendar draws and what an invoice
 * line is. The word sits inside them rather than beside them.
 *
 * One colour, bounds included. `docs/design/brand.html` is the spec, and
 * `mark-bound` carries the geometry so this and `Mark.swift` draw the same
 * mark.
 *
 * The colour is a prop because the landing page's footer recedes its mark
 * while its header does not — one mark, two placements. It is a whole utility
 * (`text-muted`), not a shade, so the bounds keep tracking it through
 * `currentColor`.
 */
export function Wordmark({
  className = 'text-strong',
}: {
  className?: string;
}) {
  return (
    <span className={`type-wordmark flex items-center ${className}`}>
      <span aria-hidden className="mark-bound" />
      <span>Stint</span>
      <span aria-hidden className="mark-bound" />
    </span>
  );
}
