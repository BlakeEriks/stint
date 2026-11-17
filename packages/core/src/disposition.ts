/** Drops what a filename or a quoted header value can't hold. */
const filenamePart = (s: string) =>
  s
    .replace(/[\p{Cc}/\\:*?"<>|]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

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
  ).replace(/ (\.\w+)$/, '$1');
  const header = `${attachment ? 'attachment' : 'inline'}; filename="${ascii}"`;
  if (ascii === name) return header;
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${header}; filename*=UTF-8''${encoded}`;
}
