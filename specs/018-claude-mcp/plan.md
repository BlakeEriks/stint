# Implementation Plan: Claude renames my projects and tasks through a Stint MCP server

**Branch**: `mcp-server` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-claude-mcp/spec.md`

## Summary

Supabase Auth's OAuth 2.1 server signs Claude in; Stint adds the three
pieces it doesn't provide. `/api/mcp` is a stateless MCP endpoint
(`@modelcontextprotocol/server`) whose five tools call the existing route
handlers in-process with the caller's token. `/.well-known/oauth-protected-resource`
points MCP clients at Supabase. `/oauth/consent` is the approval page.
`requireSession` refuses a token carrying `client_id` unless the request is
one the MCP endpoint built and marked in memory. Settings gains Connected
apps, through `GET` and `DELETE /api/v1/connected-apps`.

## Technical Context

**Language/Version**: TypeScript, Next.js App Router

**Primary Dependencies**: `@modelcontextprotocol/server` 2.x (new: the v2
SDK's `createMcpHandler`, web-standard `Request`/`Response`, stateless
fallback for 2025-era clients); `@supabase/supabase-js` `auth.oauth`

**Storage**: None new. Grants live in Supabase Auth. No migration.

**Testing**: `apps/web/test/routes.test.ts` (the endpoint, its tools,
Connected apps' shape), `apps/web/test/auth.test.ts` against the local Auth
server (a real OAuth token: the fence, the tool path, revoke), `test/ui`
(the sign-in `next` rule), stories (approval page, Connected apps)

**Target Platform**: Web and API

**Project Type**: Web app

**Performance Goals**: One Auth round trip per MCP request (revocation)

**Constraints**: Supabase's OAuth server is beta; tokens carry
`aud: authenticated` ([research.md](research.md))

**Scale/Scope**: Two routes, one well-known document, one page, one
Settings section

## Constitution Check

| Principle (`.specify/memory/constitution.md`) | Applies | How the design meets it |
| --- | --- | --- |
| I. Never silently modifies user data | Yes | A tool writes only what Claude asked; a refusal (an entry on an issued invoice) comes back as a tool error, never skipped |
| II. Logic written twice has a parity test | No | The tools call the route handlers; nothing is reimplemented |
| III. Every client through `/api/v1`; server owns timer truth | Yes | Tools call `/api/v1` handlers in-process; Connected apps goes through `/api/v1/connected-apps`. The approval page talks to Supabase Auth, as sign-in does |
| IV. `packages/core` does no I/O | No | Nothing in core changes |
| V. Tests first where a regression is silent | Yes | Routes: no token → 401 with `WWW-Authenticate`; each tool reaches its handler; a locked entry is a tool error. Auth: an OAuth token is refused outside the tools, accepted through them, and refused after revoke. UI: `next` only names a path on this site. Stories: approval page and Connected apps states |
| VI. Every press answers in the same frame | Yes | Approve and Deny show a pending state (the server decides). Revoke is predicted through `useOptimisticMutation`, and a refusal puts the row back with the notice |
| VII. A feature names what it removes | Yes | Nothing: a new surface no existing state covers |

Additional Constraints: no new fixed cost (the OAuth server is free on
every plan); nothing touches entries' immutability, timers or ids.

## Project Structure

### Documentation (this feature)

```text
specs/018-claude-mcp/
├── plan.md
├── research.md
├── quickstart.md
├── contracts/
│   ├── mcp.md
│   └── connected-apps.md
└── tasks.md
```

No `data-model.md`: no table changes.

### Source Code (repository root)

```text
apps/web/src/lib/auth.ts                         # fence, toolCall(), mcpCaller(), sessionToken()
apps/web/src/lib/mcp.ts                          # the five tools over the route handlers
apps/web/src/lib/grants.ts                       # list and revoke via Auth's REST API
apps/web/src/lib/next-path.ts                    # safeNext(): sign-in returns only to this site
apps/web/src/app/api/mcp/route.ts                # the endpoint
apps/web/src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts
apps/web/src/app/api/v1/connected-apps/route.ts
apps/web/src/app/api/v1/connected-apps/[clientId]/route.ts
apps/web/src/app/oauth/consent/page.tsx
apps/web/src/components/consent-form.tsx (+ .stories.tsx)
apps/web/src/components/connected-apps.tsx (+ .stories.tsx)
apps/web/src/app/signin/page.tsx, components/signin-form.tsx, app/auth/callback/route.ts  # next
apps/web/src/mocks/handlers.ts                   # /connected-apps for stories
packages/client/src/query-keys.ts                # keys.connectedApps()
supabase/config.toml                             # [auth.oauth_server]
docs/api.md, docs/architecture.md, docs/setup.md
```

**Structure Decision**: Everything lives in `apps/web`; the endpoint sits
at `/api/mcp`, outside `/api/v1`, because it is a protocol endpoint, not a
resource.

## Complexity Tracking

None.
