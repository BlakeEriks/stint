// Expo's monorepo defaults: it finds the workspace root and watches it, so
// `@stint/client` and the tokens resolve from their packages. Sentry's
// wrapper adds the debug ids that match a stack to its uploaded source map.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const http = require('node:http');

const config = getSentryExpoConfig(__dirname);

/* The local web render's `/api/v1`, passed to the worktree's web server, so
   the page asks its own origin and needs no CORS (`src/config.ts`).
   STINT_APP_URL names the server when it is not on 3100. A native local
   build asks Metro for sign-in too, passed to the local Supabase
   (`resolveTarget()` in `src/target.ts`). */
const upstreams = [
  ['/api/v1/', new URL(process.env.STINT_APP_URL ?? 'http://localhost:3100')],
  ['/auth/v1/', new URL('http://localhost:54321')],
];
config.server = {
  ...config.server,
  enhanceMiddleware: (metro) => (req, res, next) => {
    const to = upstreams.find(([path]) => req.url.startsWith(path))?.[1];
    if (!to) return metro(req, res, next);
    const upstream = http.request(
      {
        host: to.hostname,
        port: to.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: to.host },
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
