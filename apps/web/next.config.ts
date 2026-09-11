import type { NextConfig } from 'next';

const config: NextConfig = {
  // Shared workspace packages ship as TypeScript source.
  transpilePackages: ['@stint/core', '@stint/schema'],
};

export default config;
