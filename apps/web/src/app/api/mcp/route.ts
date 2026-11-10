import { mcpCaller } from '@/lib/auth';
import { mcp } from '@/lib/mcp';

export const dynamic = 'force-dynamic';

/**
 * Stint's MCP endpoint (docs/api.md). Supabase Auth signs the client in;
 * a request without a token Auth accepts is pointed at the metadata that
 * says so.
 */
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

export { serve as GET, serve as POST, serve as DELETE };
