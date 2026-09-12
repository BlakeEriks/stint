'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectDialog } from './project-dialog';
import type { Project } from '@/lib/client/api';

/** "No project" is a real choice, not an absent one, so it needs a value. */
const NONE = '__none__';

/**
 * Project assignment.
 *
 * A native `<select>` cannot show the project's colour swatch, and the swatch
 * is how a project is recognised at a glance everywhere else in the app.
 *
 * Radix supplies what the previous hand-rolled listbox did not: arrow-key
 * navigation, typeahead, focus return to the trigger on close, and correct
 * `aria-checked` semantics from the radio group.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
  selected,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
  selected?: Project;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Project"
          className="flex max-w-[10rem] flex-none items-center gap-1.5 rounded-md px-2 py-1
                   font-mono text-[11.5px] text-muted outline-none
                   hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus"
        >
          {selected ? (
            <>
              <Swatch color={selected.color} />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-subtle">+ Project</span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="max-h-72 w-56 overflow-y-auto"
        >
          {projects.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-subtle">
              No projects yet.
            </p>
          ) : null}

          <DropdownMenuRadioGroup
            value={value ?? NONE}
            onValueChange={(v) => onChange(v === NONE ? null : v)}
          >
            <DropdownMenuRadioItem value={NONE} className="pl-8 text-subtle">
              No project
            </DropdownMenuRadioItem>

            {projects.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className="pl-8">
                <Swatch color={p.color} />
                <span className="truncate">{p.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            + New project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selecting the new project immediately is the point of creating one
        from here — otherwise the user has to reopen the menu and find it. */}
      <ProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(project) => onChange(project.id)}
      />
    </>
  );
}

/** Per-project colour is data, so it stays an inline style. */
function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-[2px]"
      style={{ background: color ?? 'var(--text-subtle)' }}
    />
  );
}
