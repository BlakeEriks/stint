'use client';

import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { api } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { useProjectClients } from '@/lib/client/use-project-colors';

/** The props the caller spreads onto its own input. */
export type TaskSuggestInputProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  role: 'combobox';
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-autocomplete': 'list';
  'aria-activedescendant': string | undefined;
  autoComplete: 'off';
};

/** The list is a shortcut past typing, not a browsable history. */
const MAX_ROWS = 4;

export function TaskSuggest({
  value,
  onChange,
  projectId,
  disabled,
  above,
  className,
  children,
}: {
  value: string;
  /**
   * A chosen row, reported rather than applied. `projectId` is the project
   * that row was last used under — the caller decides whether to take it,
   * because the rule is that a project fills an empty field and never
   * overwrites a chosen one, and only the caller knows its own field.
   */
  onChange: (taskName: string, projectId: string | null) => void;
  /** The currently-selected project. A ranking preference, not a filter. */
  projectId?: string | null;
  disabled?: boolean;
  /** Opens upward. The timer bar is docked to the bottom of the viewport, so
      a list below its field would be off screen. */
  above?: boolean;
  /** Layout for the anchoring wrapper, which replaces the caller's input as
      the flex/grid item it used to be. */
  className?: string;
  children: (props: TaskSuggestInputProps) => ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  /* Enter accepts only a highlight the keyboard made. The list opens over the
     pointer, so hovering is not a choice — a row lands under a motionless
     cursor, and Enter would take a name the typist never selected. */
  const [byKey, setByKey] = useState(false);

  const { data } = useQuery({
    queryKey: keys.taskNames({ projectId }),
    queryFn: () => api.taskNames({ projectId }),
    /* Above the 10s default: a name typed minutes ago is still the right
       suggestion, and refetching on every focus of the timer bar is traffic
       for an accelerator nobody waited on. */
    staleTime: 60_000,
    enabled: !disabled,
  });

  const { colorByProject, clientByProject } = useProjectClients();
  const { data: projectData } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });
  const projectsById = useMemo(
    () => new Map((projectData?.projects ?? []).map((p) => [p.id, p.name])),
    [projectData],
  );

  const query = value.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = data?.taskNames ?? [];
    /* Filtered, never re-sorted — the ranking is the server's. Two orderings
       of the same names is the bug where a row moves under the cursor. */
    const matched = query
      ? all.filter((r) => r.taskName.toLowerCase().includes(query))
      : all;
    return matched.slice(0, MAX_ROWS);
  }, [data, query]);

  const shown = open && !disabled && rows.length > 0;
  const activeRow = active !== null ? rows[active] : undefined;
  const rowId = (i: number) => `${listId}-${i}`;

  function close() {
    setOpen(false);
    setActive(null);
    setByKey(false);
  }

  function choose(i: number) {
    const row = rows[i];
    if (!row) return;
    onChange(row.taskName, row.projectId);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      /* Only when this list is open. A second Escape belongs to the dialog
         around it, which has its own close to run. */
      if (shown) {
        e.stopPropagation();
        close();
      }
      return;
    }

    if (e.key === 'Tab') {
      close();
      return;
    }

    /* The arrows follow the pixels, not the array. A list drawn above the
       field is entered with Up at the row adjacent to it — the key points at
       the movement the eye sees. Rows render best-first either way; only
       which end is "nearest" changes. */
    const enter = above ? 'ArrowUp' : 'ArrowDown';
    const leave = above ? 'ArrowDown' : 'ArrowUp';
    const nearest = above ? rows.length - 1 : 0;
    const step = above ? -1 : 1;

    if (!shown) {
      if (e.key === enter && rows.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActive(nearest);
        setByKey(true);
      }
      return;
    }

    if (e.key === enter) {
      e.preventDefault();
      setActive(
        active === null
          ? nearest
          : Math.max(0, Math.min(active + step, rows.length - 1)),
      );
      setByKey(true);
      return;
    }

    if (e.key === leave) {
      e.preventDefault();
      // Stepping back past the nearest row leaves the list, restoring what was
      // typed — which is still in the field, because nothing was written.
      setActive(active === null || active === nearest ? null : active - step);
      setByKey(true);
      return;
    }

    if (e.key === 'Enter' && active !== null && byKey) {
      /* Intercepted ONLY with a row highlighted, and nothing is highlighted
         when the list opens: a timer started by typing and pressing Return
         must never take a name its typist did not finish. */
      e.preventDefault();
      choose(active);
    }
  }

  const inputProps: TaskSuggestInputProps = {
    value,
    onChange: (e) => {
      onChange(e.target.value, null);
      setOpen(true);
      // Typing invalidates the highlight rather than moving it: the row under
      // it is not the row that was there a character ago.
      setActive(null);
      setByKey(false);
    },
    onFocus: () => setOpen(true),
    onBlur: close,
    onKeyDown,
    role: 'combobox',
    'aria-expanded': shown,
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-activedescendant': shown && activeRow ? rowId(active!) : undefined,
    autoComplete: 'off',
  };

  return (
    /* The anchor is the wrapper, so it inherits the caller's own layout: in
       the timer bar it becomes the flex item the input used to be, and the
       input inside it goes full-width. */
    <div className={`relative ${className ?? ''}`}>
      {children(inputProps)}
      {shown ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Task name suggestions"
          className={`absolute left-0 right-0 z-30 overflow-hidden rounded-lg border
                      border-edge-default bg-surface-elevated p-1 shadow-float
                      ${above ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {/* An unfiltered list has to say what ordered it, or the top row
              reads as a default. A filtered one explains itself. */}
          {query ? null : (
            <div className="px-2.5 pb-1 pt-1.5 type-label text-subtle">
              Recent
            </div>
          )}
          {rows.map((row, i) => {
            const client = row.projectId
              ? clientByProject.get(row.projectId)
              : undefined;
            const project = row.projectId
              ? projectsById.get(row.projectId)
              : undefined;
            /* The client is the disambiguator — the same task name under two
               of them is the case the label exists for. Only a row with no
               project at all is internal: a project the lookup cannot see is
               archived, not unbilled, and saying "Internal" would promise the
               opposite of the rate it carries. */
            const label = !row.projectId
              ? 'Internal'
              : client
                ? `${client.name} · ${project ?? ''}`.replace(/ · $/, '')
                : (project ?? 'Archived project');
            const colour = row.projectId
              ? colorByProject.get(row.projectId)
              : null;
            return (
              // A row is deliberately not focusable and carries no key
              // handler: focus never leaves the input, which is what keeps
              // typing and arrowing one gesture. Down and Enter are handled
              // there, and `aria-activedescendant` is what announces the row.
              // biome-ignore lint/a11y/useKeyWithClickEvents: as above
              // biome-ignore lint/a11y/useFocusableInteractive: as above
              <div
                key={`${row.taskName}-${row.projectId ?? ''}`}
                id={rowId(i)}
                role="option"
                aria-selected={i === active}
                // Without this, mousedown blurs the input and the list closes
                // before the click can land on anything.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setByKey(false);
                }}
                onClick={() => choose(i)}
                className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5
                            ${i === active ? 'bg-surface-hover' : ''}`}
              >
                <span className="min-w-0 flex-[0_1_auto] truncate type-body text-primary">
                  <Match name={row.taskName} query={query} />
                </span>
                {/* A client's colour is data, so it stays an inline style. */}
                {colour ? (
                  <span
                    aria-hidden
                    className="ml-auto size-2 flex-none rounded-full"
                    style={{ background: colour }}
                  />
                ) : null}
                <span
                  className={`min-w-0 flex-[0_1_auto] truncate type-meta text-subtle
                              ${colour ? '' : 'ml-auto'}`}
                >
                  {label}
                </span>
                {/* On the highlighted row only, so it is on screen exactly
                    while it is true. */}
                {i === active ? <Kbd>↵</Kbd> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Weight marks the substring that matched. The accent is the timer's. */
function Match({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const at = name.toLowerCase().indexOf(query);
  if (at < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, at)}
      {/* `b` rather than a weight class: the emphasis is the element's own,
          so the row keeps one type role and the match still stands out. */}
      <b className="text-strong">{name.slice(at, at + query.length)}</b>
      {name.slice(at + query.length)}
    </>
  );
}
