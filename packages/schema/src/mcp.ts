import { z } from 'zod';

/** The MCP tools' inputs (`apps/web/src/lib/mcp.ts`), one per tool. */
export const McpTools = {
  list_projects: z.object({ includeArchived: z.boolean().optional() }),
  rename_project: z.object({ id: z.string(), name: z.string() }),
  list_task_names: z.object({
    projectId: z.string().optional(),
    limit: z.number().int().optional(),
  }),
  list_entries: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    projectId: z.string().optional(),
    limit: z.number().int().optional(),
  }),
  rename_entry_task: z.object({ id: z.string(), taskName: z.string() }),
};
