# Research: Claude MCP server

Each was tried against the local stack (GoTrue v2.197 with the OAuth server
on) before the plan.

## The authorization server

- **Decision**: Supabase Auth's OAuth 2.1 server, dynamic registration on,
  Authorization Path `/oauth/consent`.
- **Rationale**: Its access tokens are ordinary ES256 Supabase JWTs (`sub`,
  `role: authenticated`) plus `client_id` and `scope`, so `getClaims()` and
  RLS work unchanged. Free on every plan.
- **Verified**: register → authorize (302 to `/oauth/consent?authorization_id=`)
  → details → approve → token exchange with PKCE. A second authorize for an
  approved client returns `redirect_url` from details at once. An unknown id
  is `404 oauth_authorization_not_found`. Discovery answers at
  `/auth/v1/.well-known/openid-configuration`, which MCP clients try.
- **Alternatives**: API keys. A key is not a JWT, so it means the service
  role or minting JWTs, plus a key store and a revoke UI.

## Revocation

- **Decision**: The MCP endpoint checks the token with `auth.getUser()`.
- **Verified**: after `DELETE /user/oauth/grants?client_id=`, the
  revoked token's `GET /user` is `403 session_not_found`. `getClaims()`
  checks only the signature, so it would accept the token for up to an hour.
- **Alternatives**: `getClaims()` alone; revoke would then wait out the
  token's hour.

## The fence

- **Decision**: `requireSession` refuses claims with `client_id` unless the
  `Request` is in a module-level `WeakSet` that only `toolCall()` adds to.
- **Rationale**: Object identity can't be sent over HTTP, so no client can
  forge it; a header could be.
- **Alternatives**: A header with a secret (forgeable if it leaks, and one
  more secret); a separate `requireSession` option threaded through every
  handler (changes each route's signature).

## Audience

- **Decision**: Accepted as `authenticated`. The fence covers what audience
  binding guards against.

## The MCP SDK

- **Decision**: `@modelcontextprotocol/server` 2.x, `createMcpHandler` with
  a per-request factory; its stateless fallback serves 2025-era clients.
- **Rationale**: Web-standard `Request`/`Response`, no session store, one
  dependency (`zod`, already used). v1's `@modelcontextprotocol/sdk` pulls
  in Express and Hono.

## Connected apps

- **Decision**: `lib/grants.ts` calls Auth's `/user/oauth/grants` with the
  caller's token, from both the bearer and the cookie path.
- **Rationale**: `auth.oauth.listGrants()` needs a stored session, which
  the bearer client never has.

## Signing back in to the approval page

- **Decision**: `/signin?next=<path>` carries the path through the magic
  link's `/auth/callback?next=`. `safeNext()` keeps only a path on this
  site.
- **Rationale**: GoTrue allows any redirect on the Site URL's host, so the
  query string needs no new Redirect URL.

## Previews

- The consent redirect goes to the Auth project's Site URL plus
  `/oauth/consent`, so `stint-test` sends it to one preview at a time. A
  reviewer testing on a preview sets `stint-test`'s Site URL to that
  preview first.
