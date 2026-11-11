import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * RFC 9728: where an MCP client learns which server signs it in to
 * `/api/mcp`. Served at the root and at `/api/mcp`'s own suffix, the two
 * places a client looks.
 */
export function GET(req: Request) {
  return NextResponse.json({
    resource: `${new URL(req.url).origin}/api/mcp`,
    authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Stint',
  });
}
