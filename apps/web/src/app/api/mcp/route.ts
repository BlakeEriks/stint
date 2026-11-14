import { mcpCaller } from '@/lib/auth';
import { mcp } from '@/lib/mcp';

export const dynamic = 'force-dynamic';

/** `WWW-Authenticate` points the client at Supabase Auth, to sign in. */
async function serve(req: Request): Promise<Response> {
  const token = await mcpCaller(req);
  if (!token) {
    const metadata = `${new URL(req.url).origin}/.well-known/oauth-protected-resource/api/mcp`;
    return new Response(null, {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${metadata}"`,
      },
    });
  }
  return mcp.fetch(req, { authInfo: { token, clientId: '', scopes: [] } });
}

/**
 * The server is stateless and never pushes, so it opens no SSE stream: the
 * MCP spec lets such a server refuse GET. An open stream holds a function
 * alive, idle, until it times out, and every Claude session opens one.
 */
export function GET(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: 'POST, DELETE' },
  });
}

export { serve as POST, serve as DELETE };
