'use client';

import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/client/api';

/**
 * Project assignment.
 *
 * A native `<select>` would be simpler, but it cannot show the project's
 * colour swatch — and the swatch is how a project is recognised at a glance
 * everywhere else in the app.
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[10rem] items-center gap-1.5 rounded-md px-2 py-1
                   font-mono text-[11.5px] text-muted hover:bg-surface-hover"
      >
        {selected ? (
          <>
            <Swatch color={selected.color} />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-subtle">+ Project</span>
        )}
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg
                     border border-edge-default bg-surface-elevated py-1 shadow-lg"
        >
          <li>
            <Option
              label="No project"
              muted
              active={value === null}
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          </li>
          {projects.map((p) => (
            <li key={p.id}>
              <Option
                label={p.name}
                color={p.color}
                active={value === p.id}
                onSelect={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
              />
            </li>
          ))}
          {projects.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-subtle">
              No projects yet.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Option({
  label,
  color,
  muted,
  active,
  onSelect,
}: {
  label: string;
  color?: string | null;
  muted?: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13.5px]
                  hover:bg-surface-hover ${active ? 'text-strong' : muted ? 'text-subtle' : 'text-primary'}`}
    >
      {muted ? <span className="size-2" /> : <Swatch color={color} />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-[2px]"
      style={{ background: color ?? 'var(--text-subtle)' }}
    />
  );
}
