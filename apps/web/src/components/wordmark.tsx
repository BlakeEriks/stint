/**
 * `|Stint|` — the wordmark. `docs/design/brand.html` is the spec; `mark-bound`
 * carries the geometry so this and `Mark.swift` draw the same mark.
 *
 * `className` is a whole utility (`text-muted`), not a shade, so the bounds
 * keep tracking it through `currentColor`.
 */
export function Wordmark({
  className = 'text-strong',
  size = 'default',
}: {
  className?: string;
  /**
   * `small` for the app frame, where the mark is a way home rather than the
   * page's subject; `default` for the landing page, where it is. The bounds
   * are sized in `em`, so both draw the same mark at different scales.
   *
   * Both are the mark's own roles: `small` sits a step above the rail's
   * `type-nav` beneath it, because the way home is not a section in the list.
   */
  size?: 'default' | 'small';
}) {
  return (
    <span
      className={`${
        size === 'small' ? 'type-wordmark-small' : 'type-wordmark'
      } flex items-center ${className}`}
    >
      <span aria-hidden className="mark-bound" />
      <span>Stint</span>
      <span aria-hidden className="mark-bound" />
    </span>
  );
}
