'use client';

import { CheckIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';

/**
 * A `SelectItem` with a line under its label. Only the label is `ItemText`,
 * so the trigger shows the label alone once one is picked.
 */
export function DescribedSelectItem({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex w-full cursor-default flex-col items-start rounded-sm py-1.5 pr-8 pl-2 outline-hidden select-none focus:bg-surface-hover"
    >
      <span className="absolute top-2 right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden className="size-4 text-muted" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <span className="type-control text-strong">
        <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
      </span>
      <span className="type-support text-subtle">{description}</span>
    </SelectPrimitive.Item>
  );
}
