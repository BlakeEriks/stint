# Contract: `/api/mcp`

Streamable HTTP, stateless. `Authorization: Bearer <Supabase access token>`.

| Request | Answer |
| --- | --- |
| No token, or one Auth refuses (expired, revoked) | `401`, `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/api/mcp"` |
| A valid token | the MCP exchange |

`GET /.well-known/oauth-protected-resource[/api/mcp]`:

```json
{
  "resource": "<origin>/api/mcp",
  "authorization_servers": ["<NEXT_PUBLIC_SUPABASE_URL>/auth/v1"],
  "bearer_methods_supported": ["header"],
  "resource_name": "Stint"
}
```

## Tools

Each calls the route handler named, with the caller's token. The result's
text is the route's JSON body. A refusal is `isError: true` with
`<code>: <message>`.

| Tool | Arguments | Handler |
| --- | --- | --- |
| `list_projects` | `includeArchived?` | `GET /api/v1/projects` |
| `rename_project` | `id`, `name` | `PATCH /api/v1/projects/:id` `{ name }` |
| `list_task_names` | `projectId?`, `limit?` | `GET /api/v1/entries/task-names` |
| `list_entries` | `from?`, `to?`, `projectId?`, `clientId?`, `limit?` | `GET /api/v1/entries` |
| `rename_entry_task` | `id`, `taskName` | `PATCH /api/v1/entries/:id` `{ taskName }` |
| `list_clients` | `includeArchived?` | `GET /api/v1/clients` |
| `create_client` | the client form's fields, `id?` | `POST /api/v1/clients` |
| `update_client` | `id`, the client form's fields | `PATCH /api/v1/clients/:id`, without `archived` |
| `create_project` | `name`, `clientId?`, `hourlyRate?`, `isBillableDefault?`, `id?` | `POST /api/v1/projects` |

Inputs are `McpTools` in `@stint/schema`. A tool that changes one field of a
project or an entry is `rename_*`; one that edits a record is `update_*`.
