import {
  type CallToolResult,
  createMcpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as entries from '@/app/api/v1/entries/route';
import * as entry from '@/app/api/v1/entries/[id]/route';
import * as taskNames from '@/app/api/v1/entries/task-names/route';
import * as projects from '@/app/api/v1/projects/route';
import * as project from '@/app/api/v1/projects/[id]/route';
import { toolCall } from './auth';

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

/**
 * Each tool is a route handler called in-process with the caller's token,
 * so a rename is refused for the same reasons the app's would be.
 */
function server(token: string): McpServer {
  async function call(
    handler: Handler,
    path: string,
    { id, body }: { id?: string; body?: unknown } = {},
  ): Promise<CallToolResult> {
    const req = toolCall(
      // Never sent: the handler reads it in-process.
      new Request(`http://stint/api/v1${path}`, {
        method: body ? 'PATCH' : 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    const res = await handler(req, {
      params: Promise.resolve({ id: id ?? '' }),
    });
    const text = await res.text();
    if (res.ok) return { content: [{ type: 'text', text }] };
    const { code, message } = JSON.parse(text);
    return {
      isError: true,
      content: [{ type: 'text', text: `${code}: ${message}` }],
    };
  }

  const s = new McpServer({ name: 'Stint', version: '1.0.0' });

  s.registerTool(
    'list_projects',
    {
      description:
        'List your Stint projects, active ones unless asked for archived too.',
      inputSchema: z.object({ includeArchived: z.boolean().optional() }),
    },
    (args) => call(projects.GET as Handler, `/projects${query(args)}`),
  );

  s.registerTool(
    'rename_project',
    {
      description: 'Rename one project.',
      inputSchema: z.object({ id: z.string(), name: z.string() }),
    },
    ({ id, name }) =>
      call(project.PATCH, `/projects/${id}`, { id, body: { name } }),
  );

  s.registerTool(
    'list_task_names',
    {
      description:
        'List your recent task names, most recent first, ranked for a project if one is given.',
      inputSchema: z.object({
        projectId: z.string().optional(),
        limit: z.number().int().optional(),
      }),
    },
    (args) =>
      call(taskNames.GET as Handler, `/entries/task-names${query(args)}`),
  );

  s.registerTool(
    'list_entries',
    {
      description:
        'List time entries, newest first. `from` and `to` are ISO timestamps on the start time; `projectId` may be "none" for entries with no project.',
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        projectId: z.string().optional(),
        limit: z.number().int().optional(),
      }),
    },
    (args) => call(entries.GET as Handler, `/entries${query(args)}`),
  );

  s.registerTool(
    'rename_entry_task',
    {
      description:
        "Rename one entry's task. An entry on an issued invoice can't be changed.",
      inputSchema: z.object({ id: z.string(), taskName: z.string() }),
    },
    ({ id, taskName }) =>
      call(entry.PATCH, `/entries/${id}`, { id, body: { taskName } }),
  );

  return s;
}

function query(args: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) q.set(k, String(v));
  }
  return q.size ? `?${q}` : '';
}

/** Stateless: a server per request, so nothing is kept between them. */
export const mcp = createMcpHandler(({ authInfo }) =>
  server(authInfo?.token ?? ''),
);
