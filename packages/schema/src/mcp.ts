import { z } from 'zod';
import {
  CreateClient,
  CreateProject,
  UpdateClient,
  UpdateProject,
} from './clients.ts';
import {
  ListEntriesQuery,
  TaskNamesQuery,
  UpdateTimeEntry,
} from './entries.ts';
import { uuid } from './primitives.ts';

/** The MCP tools' inputs (`apps/web/src/lib/mcp.ts`), one per tool. */
export const McpTools = {
  list_projects: z.object({ includeArchived: z.boolean().optional() }),
  rename_project: UpdateProject.pick({ name: true })
    .required()
    .extend({ id: uuid }),
  list_task_names: TaskNamesQuery,
  list_entries: ListEntriesQuery,
  rename_entry_task: UpdateTimeEntry.pick({ taskName: true })
    .required()
    .extend({ id: uuid }),
  list_clients: z.object({ includeArchived: z.boolean().optional() }),
  create_project: CreateProject,
  create_client: CreateClient,
  /** The client form's fields; archiving stays the user's. */
  update_client: UpdateClient.omit({ archived: true }).extend({ id: uuid }),
};
