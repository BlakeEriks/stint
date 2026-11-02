'use client';

/**
 * A long choice you search: shadcn/ui's Combobox pattern
 * (ui.shadcn.com/docs/components/combobox), a Popover holding a Command,
 * composed from the vendored `popover.tsx` and `command.tsx` as `select.tsx`
 * vendors shadcn's Select. cmdk supplies the filtering, the arrow keys and
 * Enter; Radix's Popover supplies Escape and focus return.
 */
import { useState } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { inputClass } from '../field';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface ComboboxOption {
  value: string;
  label: string;
}

/* cmdk's default score is fuzzy, so "zzzz" still matches a long list:
   a substring of the label is what someone typing a city expects. */
const contains = (_value: string, search: string, keywords?: string[]) =>
  keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase())) ? 1 : 0;

/** cmdk keys items by a string, so null travels as this. */
const UNSET = '\u0000unset';

export function Combobox({
  id,
  value,
  onChange,
  options,
  unset,
  searchLabel = 'Search',
}: {
  /** The trigger's id, which the field's label points at. */
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  /** A first item that saves null, labeled with what null means. */
  unset?: string;
  searchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // A saved value the list lacks still shows as itself.
  const all =
    value && !options.some((o) => o.value === value)
      ? [{ value, label: value }, ...options]
      : options;
  const chosen =
    value === null ? unset : all.find((o) => o.value === value)?.label;
  const items = unset ? [{ value: UNSET, label: unset }, ...all] : all;
  const current = value ?? UNSET;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        role="combobox"
        aria-expanded={open}
        // Open, the trigger keeps its focus look and the chevron flips, so
        // the pressed control answers as well as the list.
        className={cn(
          inputClass,
          'group flex items-center justify-between gap-2',
          'aria-expanded:border-edge-focus aria-expanded:ring-[3px] aria-expanded:ring-edge-focus',
        )}
      >
        <span className="truncate">{chosen}</span>
        <ChevronDownIcon
          aria-hidden
          className="size-4 shrink-0 opacity-50 transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
        align="start"
        // The popover is a dialog, which axe requires be named.
        aria-label={searchLabel}
      >
        <Command defaultValue={current} label={searchLabel} filter={contains}>
          <CommandInput placeholder={`${searchLabel}…`} />
          <CommandList>
            {/* A listbox needs an option, so the empty state is one a
                screen reader reads and nobody can pick. */}
            <CommandEmpty>
              <div role="option" aria-disabled aria-selected={false}>
                No matches
              </div>
            </CommandEmpty>
            <CommandGroup>
              {items.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label, o.value]}
                  aria-checked={o.value === current}
                  onSelect={() => {
                    onChange(o.value === UNSET ? null : o.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  <CheckIcon
                    aria-hidden
                    className={cn(
                      'ml-auto',
                      o.value === current ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
