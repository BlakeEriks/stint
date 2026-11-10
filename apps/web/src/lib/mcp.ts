import {
  type CallToolResult,
  createMcpHandler,
  McpServer,
} from '@modelcontextprotocol/server';
import { McpTools } from '@stint/schema';
import * as clients from '@/app/api/v1/clients/route';
import * as client from '@/app/api/v1/clients/[id]/route';
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
 * so a call is refused for the same reasons the app’s would be.
 */
function server(token: string): McpServer {
  async function call(
    handler: Handler,
    path: string,
    {
      id,
      body,
      method = body ? 'PATCH' : 'GET',
    }: { id?: string; body?: unknown; method?: string } = {},
  ): Promise<CallToolResult> {
    const req = toolCall(
      // Never sent: the handler reads it in-process.
      new Request(`http://stint/api/v1${path}`, {
        method,
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
      inputSchema: McpTools.list_projects,
    },
    (args) => call(projects.GET as Handler, `/projects${query(args)}`),
  );

  s.registerTool(
    'rename_project',
    {
      description: 'Rename one project.',
      inputSchema: McpTools.rename_project,
    },
    ({ id, name }) =>
      call(project.PATCH, `/projects/${id}`, { id, body: { name } }),
  );

  s.registerTool(
    'list_task_names',
    {
      description:
        'List your recent task names, most recent first, ranked for a project if one is given.',
      inputSchema: McpTools.list_task_names,
    },
    (args) =>
      call(taskNames.GET as Handler, `/entries/task-names${query(args)}`),
  );

  s.registerTool(
    'list_entries',
    {
      description:
        'List time entries, newest first. `from` and `to` are ISO timestamps on the start time; `projectId` may be "none" for entries with no project.',
      inputSchema: McpTools.list_entries,
    },
    (args) => call(entries.GET as Handler, `/entries${query(args)}`),
  );

  s.registerTool(
    'rename_entry_task',
    {
      description:
        "Rename one entry's task. An entry on an issued invoice can't be changed.",
      inputSchema: McpTools.rename_entry_task,
    },
    ({ id, taskName }) =>
      call(entry.PATCH, `/entries/${id}`, { id, body: { taskName } }),
  );

  s.registerTool(
    'list_clients',
    {
      description:
        'List your clients with their details, active ones unless asked for archived too.',
      inputSchema: McpTools.list_clients,
    },
    (args) => call(clients.GET as Handler, `/clients${query(args)}`),
  );

  s.registerTool(
    'create_project',
    {
      description:
        'Add a project, under a client if `clientId` is given. Pass an `id` (a UUIDv7) so a retry adds it once.',
      inputSchema: McpTools.create_project,
    },
    (body) =>
      call(projects.POST as Handler, '/projects', { body, method: 'POST' }),
  );

  s.registerTool(
    'create_client',
    {
      description:
        'Add a client. Pass an `id` (a UUIDv7) so a retry adds it once.',
      inputSchema: McpTools.create_client,
    },
    (body) =>
      call(clients.POST as Handler, '/clients', { body, method: 'POST' }),
  );

  s.registerTool(
    'update_client',
    {
      description:
        "Edit a client's details: name, email, address, rates, currency, payment terms, billing schedule. Only the fields given change.",
      inputSchema: McpTools.update_client,
    },
    ({ id, ...body }) => call(client.PATCH, `/clients/${id}`, { id, body }),
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
