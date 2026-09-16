import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { type TaskNameRow, toTaskNameSuggestion } from '@/lib/rows';
import { TaskNamesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db, userId } = await requireSession(req);
  const q = parseQuery(req, TaskNamesQuery);

  /* `p_project_id` null means "no preference", which collapses the ranking to
     pure recency — it never filters a name out. */
  const { data, error } = await db.rpc('recent_task_names', {
    p_user_id: userId,
    p_project_id: q.projectId ?? null,
    p_limit: q.limit,
  });
  if (error) throw error;

  return NextResponse.json({
    taskNames: ((data ?? []) as TaskNameRow[]).map(toTaskNameSuggestion),
  });
});
