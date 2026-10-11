import type { SupabaseClient } from '@supabase/supabase-js';

/** True with no project, or one the caller can't see: the insert's foreign
 *  key or RLS then rejects it. */
export async function projectBillableDefault(
  db: SupabaseClient,
  projectId: string | null | undefined,
): Promise<boolean> {
  if (!projectId) return true;
  const { data, error } = await db
    .from('projects')
    .select('is_billable_default')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_billable_default ?? true;
}
