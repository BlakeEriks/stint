import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

const config: NextConfig = {
  // Shared workspace packages ship as TypeScript source.
  transpilePackages: ['@stint/core', '@stint/schema'],

  /* Read at BUILD time, so the rail can show it from a client component
     without shipping package.json to the browser. A version baked into the
     bundle is also the honest one: it names the build being looked at, which
     is the question a version in the corner is there to answer. */
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default config;
