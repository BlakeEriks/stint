import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addDays,
  buildPreview,
  isValidTimeZone,
  parseExport,
  type ClientChoice,
  type ImportPreview,
} from '@stint/core';
import { ApiError } from './errors';

const MAX_BYTES = 10 * 1024 * 1024;

const rate = (v: unknown) => (v == null ? null : Number(v));

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(form: FormData | null, name: string): unknown {
  const raw = form?.get(name);
  if (raw == null || raw === '') return undefined;
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new ApiError('VALIDATION_FAILED', `${name} is not JSON`);
  }
}

/** `{ [clientKey]: { invoicedThrough?, hourlyRate?, color? } }` */
function readChoices(v: unknown): Record<string, ClientChoice> {
  if (v === undefined) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new ApiError('VALIDATION_FAILED', 'clients is an object');
  const out: Record<string, ClientChoice> = {};
  for (const [key, c] of Object.entries(v)) {
    const {
      invoicedThrough = null,
      hourlyRate = null,
      color = null,
    } = (c ?? {}) as Record<string, unknown>;
    if (invoicedThrough !== null && !DATE.test(String(invoicedThrough)))
      throw new ApiError('VALIDATION_FAILED', 'invoicedThrough is YYYY-MM-DD');
    if (
      hourlyRate !== null &&
      !(
        typeof hourlyRate === 'number' &&
        Number.isFinite(hourlyRate) &&
        hourlyRate >= 0
      )
    )
      throw new ApiError(
        'VALIDATION_FAILED',
        'hourlyRate is a number, 0 or more',
      );
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(String(color)))
      throw new ApiError('VALIDATION_FAILED', 'color is a hex colour');
    out[key] = {
      invoicedThrough: invoicedThrough as string | null,
      hourlyRate: hourlyRate as number | null,
      color: color as string | null,
    };
  }
  return out;
}

function readExcluded(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))
    throw new ApiError('VALIDATION_FAILED', 'excluded is a list of row ids');
  return v;
}

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
  const choices = readChoices(json(form, 'clients'));
  const excluded = readExcluded(json(form, 'excluded'));

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
    db.from('clients').select('id,name,hourly_rate,color,archived_at'),
    db
      .from('projects')
      .select('id,name,client_id,hourly_rate,is_billable_default,archived_at'),
    db.from('user_settings').select('default_hourly_rate').maybeSingle(),
    dates.length
      ? db
          .from('time_entries')
          .select('id,task_name,started_at,ended_at')
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
    choices,
    excluded,
    existing: (existing.data ?? []).map((e) => ({
      id: e.id,
      taskName: e.task_name,
      startedAt: e.started_at,
      endedAt: e.ended_at,
    })),
    timeZone,
    defaultRate: rate(settings.data?.default_hourly_rate),
    clients: (clients.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      hourlyRate: rate(c.hourly_rate),
      color: c.color,
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
