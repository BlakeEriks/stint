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
import { inputClass } from './field';
import type { Project } from '@/lib/client/api';
import {
  INTERNAL_SWATCH,
  useClients,
  useProjectColors,
} from '@/lib/client/use-project-colors';
import { Check, ChevronDown, Plus } from 'lucide-react';

/** "No project" is a real choice, not an absent one, so it needs a value. */
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
 * Project assignment.
 *
 * A native `<select>` cannot show the colour swatch, and the swatch is how
 * work is recognised at a glance everywhere else in the app. The colour is
 * the CLIENT's — projects under one client share it, so the swatch answers
 * "whose work is this?" and the name answers "which piece?".
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
  trigger = 'tag',
  canCreate = true,
  id,
  disabled,
  autoFocus,
  readOnly,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
  selected?: Project;
  /**
   * `tag` is the pill the timer bar wears beside the running task. `field` is
   * a form control on `inputClass`'s metrics, so it sits level with the
   * inputs a dialog stacks it among.
   */
  trigger?: 'tag' | 'field';
  /**
   * Whether the menu offers `New project`.
   *
   * **False inside a dialog.** `ProjectDialog` is itself a dialog, and Radix
   * will not mount one inside another — the item sets its state and nothing
   * reaches the DOM, so it reads as a dead control rather than a refusal.
   * `project-dialog.tsx` records the same constraint from the other side: it
   * swaps its own content for the client form rather than stacking.
   */
  canCreate?: boolean;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * The same pill with nothing to press, for a running timer.
   *
   * **Not `disabled`.** A disabled control is one you could use but may not
   * right now, drawn dimmed and still announced as a control. The project of
   * a running entry is neither — it is a fact about work already tracked, so
   * it renders at full strength as a `span` with no chevron and nothing in
   * the accessibility tree offering an action. Changing it mid-entry would
   * re-bill time against a project that never did the work; stopping the
   * timer is how that moves.
   */
  readOnly?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const colors = useProjectColors();
  /* The same two queries the swatch already resolves through, so naming the
     client costs no fetch. Keyed by client rather than by project because
     `clientByProject` drops a client that has no colour, and that project is
     billed work whose client still has a name. */
  const clients = useClients();

  /* Before the menu, not inside it: a `DropdownMenu` that renders a plain
     span still mounts its trigger context and keyboard handlers for a thing
     that cannot open. An unprojected running entry shows nothing at all —
     a dashed "Project" slot invites the click this variant exists to
     refuse. */
  if (readOnly) {
    if (!selected) return null;
    return (
      <span
        className="flex min-w-0 max-w-[11rem] shrink items-center gap-1.5 rounded-full
                   border border-edge-default px-2.5 py-1 type-meta text-muted"
      >
        <Swatch color={colors.get(selected.id)} />
        <span className="truncate">{selected.name}</span>
      </span>
    );
  }

  return (
    <>
      <DropdownMenu>
        {/* A tag, not a bare label. Borderless it read as static text — the
            swatch looked like decoration beside a name rather than the face of
            a control, so nothing invited the click. An outline plus a chevron
            is the same affordance a select has, at the size a tag wants.

            The empty state keeps the border rather than going ghost: an
            unassigned timer is the case where the control most needs finding,
            so it is drawn with a dashed edge (a slot to fill) instead of
            disappearing until hovered.

            **Shrinkable, not `flex-none`.** Fixed, it held its full 137px in
            the timer bar while the task name beside it was crushed to 15px —
            the label surviving intact while the thing it labels disappeared.
            It gives way first now; the timer bar's own two-row phone layout
            is what actually buys both of them room. */}
        {trigger === 'tag' ? (
          <DropdownMenuTrigger
            aria-label="Project"
            className={`flex min-w-0 max-w-[11rem] shrink items-center gap-1.5 rounded-full border
                      px-2.5 py-1 type-meta outline-none transition-colors
                      hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus
                      ${
                        selected
                          ? 'border-edge-default text-muted'
                          : 'border-edge-default border-dashed text-subtle hover:text-muted'
                      }`}
          >
            {selected ? (
              <>
                <Swatch color={colors.get(selected.id)} />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <>
                <Plus
                  aria-hidden
                  className="size-3 flex-none"
                  strokeWidth={2.5}
                />
                <span>Project</span>
              </>
            )}
            <ChevronDown
              aria-hidden
              className="size-3 flex-none opacity-60"
              strokeWidth={2.5}
            />
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger
            id={id}
            aria-label="Project"
            disabled={disabled}
            /* biome-ignore lint/a11y/noAutofocus: the rule guards against
               stealing focus on PAGE load. This is a modal the user just
               opened, where something must take focus — and when the row
               they clicked exists because the project is missing, this is
               the field they came for. */
            autoFocus={autoFocus}
            /* `focus:` as well as `focus-visible:`. A control focused
               PROGRAMMATICALLY — as the inbox's unprojected row does on open
               — is never `:focus-visible`, which the browser reserves for
               keyboard-driven focus. Without this the cursor is really there
               and arrow keys work, but nothing on screen says so. */
            className={`${inputClass} flex items-center justify-between gap-2 text-left
                        disabled:opacity-60
                        focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus`}
          >
            {selected ? (
              <Row
                project={selected}
                color={colors.get(selected.id)}
                clients={clients}
              />
            ) : (
              <span className="truncate text-subtle">No project</span>
            )}
            <ChevronDown
              aria-hidden
              className="size-4 flex-none text-muted opacity-60"
              strokeWidth={2}
            />
          </DropdownMenuTrigger>
        )}

        <DropdownMenuContent
          align={trigger === 'field' ? 'start' : 'end'}
          /* A field's menu is the field's own width — it drops out of a
             full-width control, so a narrower list reads as a different
             thing. The tag has no width worth matching, so that one is sized
             to its content and hangs off the trigger's end. */
          className={
            trigger === 'field'
              ? 'max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto'
              : 'max-h-72 w-64 overflow-y-auto'
          }
        >
          {projects.length === 0 ? (
            <p className="px-3 py-2 type-support text-subtle">
              No projects yet.
            </p>
          ) : null}

          <DropdownMenuRadioGroup
            value={value ?? NONE}
            onValueChange={(v) => onChange(v === NONE ? null : v)}
          >
            <DropdownMenuRadioItem value={NONE} className={ROW}>
              <span className="flex-1 text-subtle">No project</span>
              <Tick on={value === null} />
            </DropdownMenuRadioItem>

            {projects.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id} className={ROW}>
                <Row project={p} color={colors.get(p.id)} clients={clients} />
                <Tick on={value === p.id} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {canCreate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus aria-hidden className="size-3.5" strokeWidth={2.25} />
                New project
              </DropdownMenuItem>
            </>
          ) : null}
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

/**
 * One project, however it is being shown — a menu row or the field trigger's
 * current value.
 *
 * The client is muted so the project stays the thing being chosen; it answers
 * "whose work?" for two projects that read alike apart from their client.
 *
 * **Internal work gets no client text at all.** The absence IS the answer, the
 * same reason its swatch resolves to `INTERNAL_SWATCH` rather than a shared
 * grey — a placeholder there would name something that does not exist.
 */
function Row({
  project,
  color,
  clients,
}: {
  project: Project;
  color?: string | null;
  clients: Map<string, { name: string }>;
}) {
  const client = project.clientId ? clients.get(project.clientId) : undefined;

  return (
    <>
      <Swatch color={color} />
      {/* The name is what is being picked, so it takes the room and is the
          last thing to truncate; the client is context and gives way first.
          Two `truncate` siblings with no basis split the row evenly, which
          clips a short client name and a long project name equally. */}
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {client ? (
        <span className="min-w-0 shrink type-support text-subtle">
          {client.name}
        </span>
      ) : null}
    </>
  );
}

/** A client's colour is data, so it stays an inline style. */
function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-[2px]"
      style={{ background: color ?? INTERNAL_SWATCH }}
    />
  );
}
