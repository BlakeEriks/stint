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
  /* MSW's service worker, kept out of the app's `public/`: only a preview's
     Storybook under /storybook/ serves it (scripts/preview-storybook.sh). */
  staticDirs: ['./public'],
  /* `publicDir: false`: Vite's default is the app's `public/`, which holds
     the preview build's own output, so it would copy Storybook into itself.
     `staticDirs` above is what Storybook serves. */
  viteFinal: (config) =>
    mergeConfig(config, { plugins: storyMocks(), publicDir: false }),
};

export default config;
