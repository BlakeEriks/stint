// Expo's monorepo defaults: it finds the workspace root and watches it, so
// `@stint/client` and the tokens resolve from their packages.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('node:http');

const config = getDefaultConfig(__dirname);

/* The local web render's `/api/v1`, passed to the worktree's web server, so
   the page asks its own origin and needs no CORS (`src/config.ts`).
   STINT_APP_URL names the server when it is not on 3100. */
const web = new URL(process.env.STINT_APP_URL ?? 'http://localhost:3100');
config.server = {
  ...config.server,
  enhanceMiddleware: (metro) => (req, res, next) => {
    if (!req.url.startsWith('/api/v1/')) return metro(req, res, next);
    const upstream = http.request(
      {
        host: web.hostname,
        port: web.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: web.host },
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'UNKNOWN', message: error.message }));
    });
    req.pipe(upstream);
  },
};

module.exports = config;
