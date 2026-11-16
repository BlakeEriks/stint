'use client';

import { useDialog } from '@/lib/client/use-dialog';
import { useEntryDrag } from '@/lib/client/use-entry-drag';
import type { Project, TimeEntry } from '@/lib/client/api';
import { EntryDialog, type Opens } from './entry-dialog';

/**
 * Adding and editing entries on a grid, as the calendar and Today share it:
 * the drag, the dialog, and the dialog's release of the drag on close. Each
 * surface passes only where its Add opens.
 */
export function useEntryEditor(projects: Project[]) {
  const drag = useEntryDrag();
  const editor = useDialog<Opens>();

  const edit = (existing: TimeEntry) => editor.show({ existing });

  /* Drawing on empty grid opens the editor pre-filled, rather than writing a
     row. A drag on a grid is a cheap gesture and a time entry is a financial
     record; pre-filling gets the time right without committing to it. */
  const create = (startedAt: Date, endedAt: Date) =>
    editor.show({
      seed: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
    });

  const dialog = editor.subject ? (
    <EntryDialog
      {...editor.subject}
      open={editor.open}
      onOpenChange={(open) => {
        editor.onOpenChange(open);
        if (!open) drag.release();
      }}
      projects={projects}
    />
  ) : null;

  return { drag, edit, create, dialog };
}
