'use client';

import type { LucideIcon } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
};

/**
 * A choice among two to four words, every option in view. Hand-written over
 * Radix `RadioGroup` rather than shadcn's `ToggleGroup`: a single-choice
 * toggle group can be pressed back to no value, and this always holds one.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onValueChange,
  segments,
  className,
}: {
  /** The group's accessible name. */
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  segments: Segment<T>[];
  className?: string;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      className={cn(
        'inline-flex flex-none rounded-md border border-edge-subtle bg-surface-recessed p-0.5',
        className,
      )}
    >
      {segments.map(({ value: v, label: word, icon: Icon }) => (
        <RadioGroup.Item
          key={v}
          value={v}
          className={`flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 type-control
            text-muted outline-none hover:text-strong focus-visible:ring-2
            focus-visible:ring-edge-focus data-[state=checked]:bg-surface-elevated
            data-[state=checked]:text-strong data-[state=checked]:shadow-card`}
        >
          <Icon aria-hidden className="size-3.5" />
          {word}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
