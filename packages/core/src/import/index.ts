import { parseCsv } from './csv.ts';
import type { ImportSource, ParsedRow } from './preview.ts';
import { ImportFormatError, isTogglHeader, parseToggl } from './toggl.ts';

export * from './preview.ts';

export type ParsedExport =
  | { ok: true; source: ImportSource; rows: ParsedRow[] }
  | { ok: false; reason: string };

/** Recognises the export and reads every row, or says why it could not. */
export function parseExport(text: string): ParsedExport {
  const csv = parseCsv(text);
  const header = csv[0] ?? [];
  try {
    if (isTogglHeader(header))
      return { ok: true, source: 'toggl', rows: parseToggl(csv) };
  } catch (err) {
    if (err instanceof ImportFormatError)
      return { ok: false, reason: err.message };
    throw err;
  }
  return {
    ok: false,
    reason: 'This is not a Toggl Track detailed-report CSV.',
  };
}
