'use client';

import { projectColors } from '@stint/design-tokens';

/**
 * The eight generated project colours, not a free colour input.
 *
 * They sit at a fixed L 0.70 / C 0.11 and exclude the accent's hue range, so
 * a chip can never out-bright or out-saturate the running timer. An arbitrary
 * colour could, which is why this is a closed set.
 */
export function ColorPicker({
  value,
  onChange,
  label = 'Color',
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  label?: string;
}) {
  return (
    <fieldset>
      <legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
        {label}
      </legend>

      <div className="mt-2 flex flex-wrap gap-2">
        <Swatch
          color={null}
          selected={value === null}
          onSelect={() => onChange(null)}
        />
        {projectColors.map((color) => (
          <Swatch
            key={color}
            color={color}
            selected={value?.toUpperCase() === color.toUpperCase()}
            onSelect={() => onChange(color)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Swatch({
  color,
  selected,
  onSelect,
}: {
  color: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={color ?? 'No color'}
      className={`size-7 rounded-md border transition-colors ${
        selected
          ? 'border-edge-control ring-2 ring-edge-control'
          : 'border-edge-subtle hover:border-edge-default'
      }`}
      style={{ background: color ?? 'transparent' }}
    >
      {color === null ? (
        <span aria-hidden className="text-[13px] text-subtle">
          —
        </span>
      ) : null}
    </button>
  );
}
