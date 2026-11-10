# Tasks: Claude renames my projects and tasks through a Stint MCP server

**Input**: [plan.md](plan.md), [spec.md](spec.md), [contracts/](contracts/)

Tests come first where Constitution V asks.

## Phase 1: Setup

- [x] T001 Add `@modelcontextprotocol/server` to `apps/web/package.json`
- [x] T002 Turn on `[auth.oauth_server]` in `supabase/config.toml`

## Phase 2: Foundation (the fence)

- [x] T003 [US1] Test in `apps/web/test/auth.test.ts`: a real OAuth token is refused by `requireSession`, and accepted for a request `toolCall()` marked
- [x] T004 [US1] `apps/web/src/lib/auth.ts`: refuse `client_id` claims outside `toolCall()`; `mcpCaller()` checks the token with Auth

## Phase 3: User Story 1 + 2 — Connect and rename (P1)

- [x] T005 [US1] Tests in `apps/web/test/routes.test.ts`: `/api/mcp` without a token is `401` with `WWW-Authenticate`; the well-known document names the Auth server; each tool reaches its handler; a locked entry is a tool error
- [x] T006 [US1] `apps/web/src/lib/mcp.ts` and `apps/web/src/app/api/mcp/route.ts`
- [x] T007 [US1] `apps/web/src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts`
- [x] T008 Dropped: `/auth/callback` reuses `sameOriginURL()`, which `preview-signin.test.ts` already covers
- [x] T009 [US1] `next` through `/signin`, the sign-in form and `/auth/callback`
- [x] T010 [US1] `apps/web/src/components/consent-form.tsx` with stories (details, unusable link), and `apps/web/src/app/oauth/consent/page.tsx`

## Phase 4: User Story 3 — Connected apps (P2)

- [x] T011 [US3] Test in `apps/web/test/auth.test.ts`: the grant is listed by `GET /api/v1/connected-apps`; `DELETE` revokes it and `/api/mcp` then refuses the token
- [x] T012 [US3] `apps/web/src/lib/grants.ts` and the two routes
- [x] T013 [US3] `apps/web/src/components/connected-apps.tsx` with stories (none, one app), the mock handlers, `keys.connectedApps()`, and the section in Settings

## Phase 5: Polish

- [x] T014 Docs: `docs/api.md`, `docs/architecture.md`, `docs/setup.md`
- [x] T015 Verify: doc drift, `pnpm verify:static`, `verify:db`, `test:auth`, the flow end to end against local Stint
