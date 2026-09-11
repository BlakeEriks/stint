'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Sessions live in cookies, so the same session the
 * route handlers read is the one the browser holds — no token plumbing.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
