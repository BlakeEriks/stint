#!/usr/bin/env node
/**
 * Serves docs/design for reading in a browser.
 *
 * The docs are static HTML that link a stylesheet by relative path, so
 * opening one with file:// misses `screens/_mockup.css` and renders unstyled.
 * A server is the whole requirement — no build, no watch, no dependency.
 *
 * The index at `/` is built by READING THE DIRECTORY on each request, so a
 * new doc appears the moment it is saved and a deleted one stops being
 * listed. A hand-maintained list here would be the stale second list the docs
 * rule exists to prevent.
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../docs/design');
const PORT = Number(process.env.PORT ?? 8778);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8',
};

/** Title from the doc's own <title>, so the index cannot drift from the page. */
async function titleOf(path) {
  const head = (await readFile(path, 'utf8')).slice(0, 2048);
  const m = head.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

async function collect() {
  const surfaces = [];
  const screens = [];

  for (const name of await readdir(ROOT)) {
    if (name.endsWith('.html')) {
      surfaces.push({
        href: `/${name}`,
        name,
        title: await titleOf(join(ROOT, name)),
      });
    }
  }

  const screensDir = join(ROOT, 'screens');
  for (const name of await readdir(screensDir).catch(() => [])) {
    // `_`-prefixed files are the scaffold (_shell, _mockup.css), not screens.
    if (!name.endsWith('.html') || name.startsWith('_')) continue;
    screens.push({
      href: `/screens/${name}`,
      name,
      title: await titleOf(join(screensDir, name)),
    });
  }

  const shell = join(screensDir, '_shell.html');
  const hasShell = await stat(shell).then(
    () => true,
    () => false,
  );

  return { surfaces, screens, hasShell };
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const card = (d) => `
      <a class="doc" href="${esc(d.href)}">
        <span class="doc-title">${esc(d.title ?? d.name)}</span>
        <span class="doc-file">${esc(d.name)}</span>
      </a>`;

async function index() {
  const { surfaces, screens, hasShell } = await collect();

  return `<!doctype html>
<meta charset="utf-8">
<title>Stint Design</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/screens/_mockup.css">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg-primary); color: var(--text-primary);
    font-family: var(--font-sans); font-size: 15px; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 900px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
  h1 { margin: 0 0 .5rem; font-size: 1.75rem; font-weight: 600; letter-spacing: -.025em; color: var(--text-strong); }
  .standfirst { margin: 0 0 1rem; max-width: 62ch; color: var(--text-muted); }
  .eyebrow {
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    letter-spacing: .16em; text-transform: uppercase; color: var(--text-subtle);
  }
  .sec { margin-top: 3rem; }
  .sec-head { padding-bottom: .7rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 1.25rem; }
  .docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 12px; }
  .doc {
    display: flex; flex-direction: column; gap: 4px;
    padding: 14px 16px; border-radius: 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-card);
    text-decoration: none;
  }
  .doc:hover { background: var(--bg-hover); }
  .doc-title { font-size: 15px; font-weight: 500; color: var(--text-strong); }
  .doc-file { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-subtle); }
  .mark { font-size: 24px; color: var(--text-strong); margin-bottom: 2rem; display: inline-flex; }
  code { font-family: var(--font-mono); font-size: 13px; color: var(--text-strong); }
</style>

<div class="page">
  <span class="mark">Stint</span>
  <h1>Design docs</h1>
  <p class="standfirst">
    Every page reads its colours, type and the mark from the generated
    <code>screens/_mockup.css</code>, so nothing here can show a stale value.
  </p>

  <section class="sec">
    <div class="sec-head"><span class="eyebrow">Identity &amp; surfaces</span></div>
    <div class="docs">${surfaces.map(card).join('')}</div>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="eyebrow">Screens</span></div>
    <div class="docs">${screens.length ? screens.map(card).join('') : '<p class="standfirst">No screen docs yet. Copy <code>screens/_shell.html</code> to start one.</p>'}</div>
  </section>
${
  hasShell
    ? `
  <section class="sec">
    <div class="sec-head"><span class="eyebrow">Scaffold</span></div>
    <div class="docs">${card({ href: '/screens/_shell.html', name: '_shell.html', title: 'The app shell' })}</div>
  </section>`
    : ''
}
</div>
`;
}

/* A nav strip injected into every doc, so moving between them does not mean
   going back to the index first. Injected at serve time rather than pasted
   into each file: a doc is a spec, and a link bar is not part of what it
   specifies. */
const NAV = `
<style>
  #dx-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 999;
    display: flex; align-items: center; gap: 14px;
    padding: 8px 16px;
    background: var(--bg-recessed, #0A0B0E);
    border-bottom: 1px solid var(--border-subtle, #2F333A);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  }
  #dx-nav a { color: var(--text-subtle, #838A97); text-decoration: none; }
  #dx-nav a:hover { color: var(--text-strong, #F9FAFD); }
  #dx-nav a[aria-current] { color: var(--text-strong, #F9FAFD); }
  body { padding-top: 37px !important; }
</style>
<nav id="dx-nav"><a href="/">Index</a><span id="dx-links"></span></nav>
<script>
  fetch('/_docs.json').then(r => r.json()).then(docs => {
    const here = location.pathname;
    document.getElementById('dx-links').innerHTML = docs
      .map(d => '<a href="' + d.href + '"' + (d.href === here ? ' aria-current="page"' : '') +
                ' style="margin-right:14px">' + d.label + '</a>')
      .join('');
  }).catch(() => {});
</script>
`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await index());
    return;
  }

  if (pathname === '/_docs.json') {
    const { surfaces, screens } = await collect();
    const label = (d) => d.name.replace(/\.html$/, '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        [...surfaces, ...screens].map((d) => ({
          href: d.href,
          label: label(d),
        })),
      ),
    );
    return;
  }

  // Contain the path inside ROOT — this serves a directory over HTTP, so a
  // `..` in the request must not be able to read the rest of the disk.
  const target = join(ROOT, normalize(pathname));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    const type = TYPES[extname(target)] ?? 'application/octet-stream';
    // No caching: the point is to edit a doc and hit reload.
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });

    if (extname(target) === '.html') {
      // After <title> so the nav's tokens resolve against the doc's own
      // stylesheet, which the doc links itself.
      const html = body.toString();
      const at = html.search(/<\/title>/i);
      res.end(
        at === -1
          ? NAV + html
          : html.slice(0, at + 8) + NAV + html.slice(at + 8),
      );
      return;
    }
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<p>Not found. <a href="/">Index</a></p>');
  }
});

server.listen(PORT, () => {
  console.log(`design docs  →  http://localhost:${PORT}`);
});
