/**
 * Where a sign-in email's link lands on `origin`, going on to `next`.
 *
 * It always carries a query: the email appends `&token_hash=…` to it
 * (`supabase/templates/magic_link.html`).
 */
export function signInLanding(origin: string, next = '/'): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
