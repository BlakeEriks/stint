import type { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A supabase-js-shaped query builder over node-postgres, used so the real
 * route handlers can run against a real database in tests. `userId` null
 * is the service client, with no user scope.
 */
export function makeDb(pool: Pool, userId: string | null): SupabaseClient;
