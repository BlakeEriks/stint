import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

/**
 * Request-scoped client for browser callers (cookie session).
 * RLS applies, so every query is already scoped to the signed-in user.
 */
export async function cookieClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a Server Component render — safe to ignore, the
            // middleware refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * Client for bearer-token callers (Expo, macOS).
 * The token rides on every request, so RLS applies identically.
 */
export function bearerClient(token: string): SupabaseClient {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
