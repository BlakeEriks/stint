/** Drops what a filename or a quoted header value can't hold, and the
 *  dots and spaces a stem can't end in. */
function filenamePart(s: string): string {
  const name = s
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  // A loop, not a regex: one anchored at the end backtracks on a long run.
  let end = dot;
  while (end > 0 && (name[end - 1] === ' ' || name[end - 1] === '.')) end--;
  return name.slice(0, end) + name.slice(dot);
}

/**
 * A `content-disposition` value. A non-ASCII name goes in `filename*`
 * (RFC 8187), with an ASCII `filename` that drops what it can't hold.
 */
export function contentDisposition(
  filename: string,
  attachment: boolean,
): string {
  const name = filenamePart(filename);
  const ascii = filenamePart(
    name.normalize('NFKD').replace(/[^\x20-\x7e]/g, ''),
  );
  const header = `${attachment ? 'attachment' : 'inline'}; filename="${ascii}"`;
  if (ascii === name) return header;
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${header}; filename*=UTF-8''${encoded}`;
}
