/** Drops what a filename or a quoted header value can't hold, and the
 *  dots and spaces a stem can't end in. */
const filenamePart = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, '')
    .trim()
    .replace(/[ .]+(\.\w+)$/, '$1');

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
