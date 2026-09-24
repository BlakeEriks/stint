import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addDays,
  buildPreview,
  isValidTimeZone,
  parseExport,
  type ImportPreview,
} from '@stint/core';
import { ApiError } from './errors';

const MAX_BYTES = 10 * 1024 * 1024;

const rate = (v: unknown) => (v == null ? null : Number(v));

/**
 * The uploaded export, read and previewed. Both import routes call this, so
 * confirm re-derives from the file itself and never trusts a preview a
 * client echoes back.
 */
export async function readImport(
  req: Request,
  db: SupabaseClient,
  userId: string,
): Promise<ImportPreview> {
  const form = await req.formData().catch(() => null);
  const files = form?.getAll('file') ?? [];
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File))
    throw new ApiError('VALIDATION_FAILED', 'Send exactly one file as "file"');
  if (file.size > MAX_BYTES)
    throw new ApiError('VALIDATION_FAILED', 'The file is larger than 10 MB');

  const timeZone = String(form?.get('timeZone') ?? '');
  if (!isValidTimeZone(timeZone))
    throw new ApiError('VALIDATION_FAILED', 'A valid timeZone is required');

  const allBillable = form?.get('allBillable') === 'true';
  const through = String(form?.get('invoicedThrough') ?? '');
  if (through && !/^\d{4}-\d{2}-\d{2}$/.test(through))
    throw new ApiError('VALIDATION_FAILED', 'invoicedThrough is YYYY-MM-DD');

  const parsed = parseExport(await file.text());
  if (!parsed.ok) throw new ApiError('IMPORT_FILE_UNRECOGNIZED', parsed.reason);

  /* Existing work the export could overlap: a day's margin either side of
     its dates covers any zone the times resolve in. */
  const dates = parsed.rows.flatMap((r) => [
    r.startDate,
    r.endDate ?? r.startDate,
  ]);
  const from = addDays(
    dates.reduce((a, b) => (b < a ? b : a), dates[0] ?? ''),
    -1,
  );
  const to = addDays(
    dates.reduce((a, b) => (b > a ? b : a), dates[0] ?? ''),
    2,
  );

  const [clients, projects, settings, existing] = await Promise.all([
    db.from('clients').select('id,name,hourly_rate,archived_at'),
    db
      .from('projects')
      .select('id,name,client_id,hourly_rate,is_billable_default,archived_at'),
    db.from('user_settings').select('default_hourly_rate').maybeSingle(),
    dates.length
      ? db
          .from('time_entries')
          .select('id,started_at,ended_at')
          .not('ended_at', 'is', null)
          .lt('started_at', `${to}T00:00:00Z`)
          .gt('ended_at', `${from}T00:00:00Z`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clients.error) throw clients.error;
  if (projects.error) throw projects.error;
  if (settings.error) throw settings.error;
  if (existing.error) throw existing.error;

  return buildPreview(parsed.source, parsed.rows, {
    userId,
    allBillable,
    invoicedThrough: through || null,
    existing: (existing.data ?? []).map((e) => ({
      id: e.id,
      startedAt: e.started_at,
      endedAt: e.ended_at,
    })),
    timeZone,
    defaultRate: rate(settings.data?.default_hourly_rate),
    clients: (clients.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      hourlyRate: rate(c.hourly_rate),
      archived: c.archived_at != null,
    })),
    projects: (projects.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.client_id,
      hourlyRate: rate(p.hourly_rate),
      isBillableDefault: p.is_billable_default,
      archived: p.archived_at != null,
    })),
  });
}
