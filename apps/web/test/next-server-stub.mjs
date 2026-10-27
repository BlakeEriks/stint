// `next/server` outside the Next runtime exports nothing usable. The route
// handlers use NextResponse.json / new NextResponse(body, init), both thin
// wrappers over the standard Response, and `after()` — so the handlers
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

// `after()` runs its task once the response is out. Here it runs at once,
// and a test awaits what it scheduled with `globalThis.__AFTER__`.
export function after(task) {
  const run = typeof task === 'function' ? task : () => task;
  globalThis.__AFTER__ ??= [];
  globalThis.__AFTER__.push(Promise.resolve().then(run));
}
