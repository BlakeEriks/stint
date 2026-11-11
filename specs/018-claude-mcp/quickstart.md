# Quickstart: Claude MCP server

1. Local Auth needs `[auth.oauth_server]` on (`supabase/config.toml`); a
   stack started before it needs a restart.
2. `claude mcp add --transport http stint http://localhost:<port>/api/mcp`.
3. Claude opens the browser at Auth, which redirects to the Site URL's
   `/oauth/consent`. Sign in if asked, press Approve.
4. Ask Claude to rename a project; see it in Stint.
5. Settings → Connected apps lists Claude; Revoke, and Claude's next call
   is refused.
