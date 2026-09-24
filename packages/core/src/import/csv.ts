/**
 * RFC 4180: quoted fields may hold separators, newlines and `""` escapes.
 * Comma or tab, whichever the header line uses more of — a CSV opened and
 * re-saved in a spreadsheet often comes back tab-separated.
 */
export function parseCsv(text: string): string[][] {
  const header = text.slice(0, text.search(/\r?\n|$/));
  const sep = header.split('\t').length > header.split(',').length ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
