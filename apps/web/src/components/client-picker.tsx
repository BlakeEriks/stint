'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { inputClass } from './field';
import { Swatch } from './swatch';
import type { Client } from '@/lib/client/api';
import { Check, ChevronDown, Plus } from 'lucide-react';

/** "No client" is a real choice, not an absent one, so it needs a value. */
const NONE = '__none__';

/* `pl-2`, not the primitive's `pl-8`: that gutter exists for the radio dot,
   which is suppressed here. A dot the size of the swatch, eight pixels from
   it, reads as a second swatch rather than as "this one is selected". */
const ROW = 'gap-2 pl-2 [&>span:first-child]:hidden';

/** The selected mark, where a swatch cannot be mistaken for it. */
function Tick({ on }: { on: boolean }) {
  return on ? (
    <Check aria-hidden className="size-3.5 flex-none text-muted" />
  ) : null;
}

/**
 * Client assignment.
 *
 * A menu rather than a `Select`: a client row carries its colour swatch, and
 * `project-dialog` hangs a create action off the bottom — neither of which
 * Radix's Select hosts. The colour belongs to the client, so this is the one
 * control where the swatch is the subject rather than an inherited mark.
 *
 * Radix supplies arrow-key navigation, typeahead, focus return to the trigger
 * on close, and `aria-checked` from the radio group.
 */
export function ClientPicker({
  clients,
  value,
  onChange,
  onAdd,
  label = 'Client',
  placeholder = 'No client — internal work',
  id,
  disabled,
}: {
  clients: Client[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Given, the menu grows a `+ Add a client…` item below a separator. */
  onAdd?: () => void;
  label?: string;
  /** What the trigger reads when nothing is chosen. */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const selected = value ? clients.find((c) => c.id === value) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        aria-label={label}
        disabled={disabled}
        /* `focus:` as well as `focus-visible:`. A control focused
           PROGRAMMATICALLY is never `:focus-visible`, which the browser
           reserves for keyboard-driven focus, so without the pair the cursor
           is really there with nothing on screen saying so. */
        className={`${inputClass} flex items-center justify-between gap-2 text-left
                    disabled:opacity-60
                    focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus`}
      >
        {selected ? (
          <Row client={selected} />
        ) : (
          <span className="truncate text-subtle">{placeholder}</span>
        )}
        <ChevronDown
          aria-hidden
          className="size-4 flex-none text-muted opacity-60"
          strokeWidth={2}
        />
      </DropdownMenuTrigger>

      {/* The menu is the field's own width: it drops out of a full-width
          control, so a narrower list reads as a different thing. */}
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={value ?? NONE}
          onValueChange={(v) => onChange(v === NONE ? null : v)}
        >
          <DropdownMenuRadioItem value={NONE} className={ROW}>
            <span className="flex-1 text-subtle">{placeholder}</span>
            <Tick on={value === null} />
          </DropdownMenuRadioItem>

          {clients.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id} className={ROW}>
              <Row client={c} />
              <Tick on={value === c.id} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {onAdd ? (
          <>
            {/* Below the separator so it does not sit between real choices —
                and present even with no clients at all, which is the case that
                made a first project impossible to attach to anything. */}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAdd}>
              <Plus aria-hidden className="size-3.5" strokeWidth={2.25} />
              Add a client…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One client, in a menu row or as the trigger's current value. */
function Row({ client }: { client: Client }) {
  return (
    <>
      <Swatch color={client.color} />
      <span className="min-w-0 flex-1 truncate">{client.name}</span>
    </>
  );
}
