/**
 * `|Stint|` — the wordmark. `docs/design/brand.html` is the spec; `mark-bound`
 * carries the geometry so this and `Mark.swift` draw the same mark.
 *
 * `className` is a whole utility (`text-muted`), not a shade, so the bounds
 * keep tracking it through `currentColor`.
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
