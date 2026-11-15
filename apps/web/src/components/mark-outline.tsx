import { brand, markOutline } from '@stint/design-tokens';

/**
 * `|Stint|™` as generated outlines, for a render with no webfont or
 * stylesheet: the error page and the link-preview image. `size` is the font
 * size the mark stands for; the colors are styles, so a `var()` works.
 */
export function MarkOutline({
  size,
  bounds,
  name,
}: {
  size: number;
  bounds: string;
  name: string;
}) {
  const { width, height } = markOutline;
  return (
    <svg
      role="img"
      aria-label="Stint"
      width={(width / 1000) * size}
      height={(height / 1000) * size}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path d={markOutline.bounds} style={{ fill: bounds }} />
      <path d={markOutline.name} style={{ fill: name }} />
      <path
        d={markOutline.tm}
        style={{ fill: name, fillOpacity: brand.mark.tmOpacity }}
      />
    </svg>
  );
}
