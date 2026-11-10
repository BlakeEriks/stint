import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';
// `@sentry/core`, not `@sentry/nextjs`, for the reason in `errors.ts`.
import { setUser } from '@sentry/core';
import { cookieClient, bearerClient, testDb } from './supabase';
import { ApiError } from './errors';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

export interface Session {
  userId: string;
  db: SupabaseClient;
}

/**
 * Resolves the caller from either a bearer token (Expo, macOS) or a cookie
 * session (web). Both paths end up with an RLS-scoped client, so downstream
 * queries cannot reach another user's rows even if a filter is forgotten.
 *
 * The request's Sentry events name the user by id alone.
 */
export async function requireSession(req: Request): Promise<Session> {
  const session = await resolve(req);
  setUser({ id: session.userId });
  return session;
}

async function resolve(req: Request): Promise<Session> {
  const injected = testDb();
  if (injected) return { userId: TEST_USER_ID, db: injected };

  const token = bearerToken(req);
  if (token) {
    const db = bearerClient(token);
    // The token must be passed EXPLICITLY — see verify().
    const claims = await verify(db, 'Invalid or expired token', token);
    /* A connected app's token (Supabase's OAuth server adds `client_id`)
       reaches only the MCP tools here; the database's `connected_app()`
       policies fence the Data API. */
    if (claims.client_id && !toolCalls.has(req)) {
      throw new ApiError(
        'UNAUTHORIZED',
        'A connected app’s token only reaches its MCP tools',
      );
    }
    return { userId: claims.sub, db };
  }

  const db = await cookieClient();
  return { userId: (await verify(db, 'Not signed in')).sub, db };
}

/**
 * Requests the MCP endpoint built for its tools. Object identity can't
 * cross HTTP, so no client can forge membership, as it could a header.
 */
const toolCalls = new WeakSet<Request>();

/** Marks `req` as an MCP tool's call, which a connected app may make. */
export function toolCall(req: Request): Request {
  toolCalls.add(req);
  return req;
}

/**
 * The MCP caller's token, or null when Auth refuses it.
 *
 * `getUser()`, not `getClaims()`: a revoked app's token keeps a valid
 * signature until it expires, and only Auth knows its session is gone.
 */
export async function mcpCaller(req: Request): Promise<string | null> {
  const token = bearerToken(req);
  if (!token || testDb()) return token;
  const { data, error } = await bearerClient(token).auth.getUser(token);
  // Auth answering is a refusal; Auth unreachable is a failure.
  if (isAuthRetryableFetchError(error)) throw error;
  return data.user ? token : null;
}

/**
 * The caller's access token, for a call to Auth's own API on their behalf.
 * `requireSession` has verified it already.
 */
export async function callerToken(
  req: Request,
  db: SupabaseClient,
): Promise<string> {
  const token = bearerToken(req);
  if (token) return token;
  const { data } = await db.auth.getSession();
  if (!data.session) throw new ApiError('UNAUTHORIZED', 'Not signed in');
  return data.session.access_token;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Establish who the caller is, from the JWT's own signature.
 *
 * `getClaims()` verifies the ES256 signature locally against a cached JWKS,
 * so identity costs no round-trip; `getUser()` calls the Auth server on
 * *every* request, and this runs before every route. On a project still
 * using a symmetric secret it falls back to that same server call.
 *
 * `getSession()` would be wrong: it reads the cookie without revalidating,
 * and a cookie is forgeable.
 *
 * `token` MUST be passed for the bearer path. `getClaims()` reads the stored
 * session, not the `Authorization` header that `bearerClient` sets via
 * `global.headers` — with no stored session it returns `{ data: null, error:
 * null }`, so the call *succeeds* while yielding no claims and every bearer
 * request 401s. Nothing raises, and the route tests inject `__TEST_DB__` and
 * never take this path.
 */
async function verify(
  db: SupabaseClient,
  message: string,
  token?: string,
): Promise<{ sub: string; client_id?: string }> {
  const { data, error } = await db.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub) {
    throw new ApiError('UNAUTHORIZED', message);
  }
  return { sub: claims.sub, client_id: claims.client_id as string | undefined };
}
