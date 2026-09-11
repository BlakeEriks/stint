// `next/server` outside the Next runtime exports nothing usable. The route
// handlers only use NextResponse.json / new NextResponse(body, init), both
// of which are thin wrappers over the standard Response — so the handlers
// under test are unmodified.
export class NextResponse extends Response {
  static json(body, init) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  }
}
export class NextRequest extends Request {}
