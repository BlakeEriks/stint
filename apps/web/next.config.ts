import type { NextConfig } from 'next';

const config: NextConfig = {
  // Shared workspace packages ship as TypeScript source.
  transpilePackages: ['@tt/core', '@tt/schema'],
};

export default config;
