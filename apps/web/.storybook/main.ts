import type { StorybookConfig } from '@storybook/nextjs-vite';
import { mergeConfig } from 'vite';
import { storyMocks } from './vite-mocks.mts';

const config: StorybookConfig = {
  framework: '@storybook/nextjs-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-mcp',
    'msw-storybook-addon',
  ],
  // MSW's service worker, kept out of `public/` so the app never serves it.
  staticDirs: ['./public'],
  viteFinal: (config) => mergeConfig(config, { plugins: storyMocks() }),
};

export default config;
