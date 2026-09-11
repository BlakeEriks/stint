// Resolves what `node --test` cannot on its own: Next's subpath exports,
// the `@/*` alias, and extensionless relative TS imports. Tests only —
// the app build uses Next's own resolver.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolvePath(here, '../src');

const withExt = (p) => {
  if (existsSync(p) && !existsSync(p + '.ts')) return p;
  for (const ext of ['.ts', '.tsx', '.js']) if (existsSync(p + ext)) return p + ext;
  for (const ext of ['/index.ts', '/index.tsx']) if (existsSync(p + ext)) return p + ext;
  return p;
};

export async function resolve(specifier, context, next) {
  // next/server needs the Next runtime; substitute a standard-Response
  // shim so the handlers themselves run unmodified.
  if (specifier === 'next/server') {
    return { url: pathToFileURL(resolvePath(here, 'next-server-stub.mjs')).href, shortCircuit: true };
  }
  // Any other `next/<subpath>` — Node cannot read Next's exports map.
  if (specifier.startsWith('next/')) {
    const file = resolvePath(here, `../node_modules/${specifier}.js`);
    if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return { url: pathToFileURL(withExt(resolvePath(srcRoot, specifier.slice(2)))).href, shortCircuit: true };
  }
  // Extensionless relative import from a TS file.
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
    const target = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    const resolved = withExt(target);
    if (resolved !== target || existsSync(resolved)) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
