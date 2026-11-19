import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { pushTimerChanged } from '@/lib/push';
import { RenameTaskName } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  const { db, userId } = await requireSession(req);
  const body = await parseBody(req, RenameTaskName);

  const { data, error } = await db.rpc('rename_task_name', {
    p_user_id: userId,
    p_from: body.from,
    p_to: body.to,
    p_project_id: body.projectId ?? null,
  });
  if (error) throw error;

  // An aggregate, so always exactly one row.
  const [{ renamed, running }] = data as [
    { renamed: number; running: boolean },
  ];
  if (running) pushTimerChanged(db, userId);
  return NextResponse.json({ renamed });
});
