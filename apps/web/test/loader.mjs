// Resolves and transforms what `node --test` cannot on its own:
//   - Next's subpath exports (`next/server`, replaced with a Response shim)
//   - the `@/*` path alias and extensionless relative TS imports
//   - JSX in .tsx files, via the SWC binary Next already ships
//
// Tests only. The app build uses Next's own pipeline.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolvePath(here, '../src');
const require = createRequire(import.meta.url);

/** Locates the platform SWC binary inside the pnpm store. */
function loadSwc() {
  const store = resolvePath(here, '../../../node_modules/.pnpm');
  if (!existsSync(store)) return null;
  const pkg = readdirSync(store).find((d) => /^@next\+swc-/.test(d));
  if (!pkg) return null;
  const scoped = resolvePath(store, pkg, 'node_modules/@next');
  const inner = readdirSync(scoped)[0];
  const dir = resolvePath(scoped, inner);
  const binary = readdirSync(dir).find((f) => f.endsWith('.node'));
  if (!binary) return null;
  try {
    return require(resolvePath(dir, binary));
  } catch {
    return null;
  }
}

const swc = loadSwc();

const withExt = (p) => {
  if (existsSync(p) && !existsSync(`${p}.ts`)) return p;
  for (const ext of ['.ts', '.tsx', '.js', '.mjs'])
    if (existsSync(p + ext)) return p + ext;
  for (const ext of ['/index.ts', '/index.tsx'])
    if (existsSync(p + ext)) return p + ext;
  return p;
};

export async function resolve(specifier, context, next) {
  // next/server needs the Next runtime; substitute a standard-Response shim
  // so the handlers themselves run unmodified.
  if (specifier === 'next/server') {
    return {
      url: pathToFileURL(resolvePath(here, 'next-server-stub.mjs')).href,
      shortCircuit: true,
    };
  }
  // Any other `next/<subpath>` — Node cannot read Next's exports map.
  if (specifier.startsWith('next/')) {
    const file = resolvePath(here, `../node_modules/${specifier}.js`);
    if (existsSync(file))
      return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return {
      url: pathToFileURL(withExt(resolvePath(srcRoot, specifier.slice(2))))
        .href,
      shortCircuit: true,
    };
  }
  // Extensionless relative import from a TS file.
  if (specifier.startsWith('.') && /\.tsx?$/.test(context.parentURL ?? '')) {
    const target = resolvePath(
      dirname(fileURLToPath(context.parentURL)),
      specifier,
    );
    const resolved = withExt(target);
    if (resolved !== target || existsSync(resolved)) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  // Node strips types but cannot transform JSX, so .tsx goes through SWC.
  if (url.endsWith('.tsx')) {
    if (!swc) {
      throw new Error(
        'Cannot load .tsx in tests: the SWC binary was not found. ' +
          'Run `pnpm install` in apps/web.',
      );
    }
    const path = fileURLToPath(url);
    const source = readFileSync(path, 'utf8');
    const { code } = swc.transformSync(
      source,
      false,
      Buffer.from(
        JSON.stringify({
          filename: path,
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            target: 'es2022',
            transform: { react: { runtime: 'automatic' } },
          },
          module: { type: 'es6' },
        }),
      ),
    );
    return { format: 'module', source: code, shortCircuit: true };
  }
  return next(url, context);
}
