import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';

/**
 * The client's color, wherever one is drawn beside a name.
 *
 * A client's color is data, so it stays an inline style — the class list
 * carries only the shape, which is one size in every list, legend and picker
 * that shows one.
 *
 * `aria-hidden` because the name is right there: a screen reader announcing a
 * color before every client is noise, not information.
 *
 * `null` resolves to `INTERNAL_SWATCH` — internal work has no client and
 * therefore no color, and the gray is what the absence looks like.
 */
export function Swatch({
  color,
  size = 'size-2',
  style,
}: {
  color?: string | null;
  /**
   * The size utility, whole — not a class appended to a default one. Two
   * `size-*` utilities on one element have equal specificity, so which wins
   * is Tailwind's emitted order rather than the order they are written in.
   */
  size?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`${size} flex-none rounded-[2px]`}
      style={{ backgroundColor: color ?? INTERNAL_SWATCH, ...style }}
    />
  );
}
