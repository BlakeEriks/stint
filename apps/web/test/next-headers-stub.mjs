// `next/headers` outside the Next runtime has no request to read. A test
// request carries no cookie, so the stub answers as a browser with none does,
// and an unsigned request reaches `requireSession`'s real cookie path.
export async function cookies() {
  return { getAll: () => [], get: () => undefined, set: () => {} };
}
