import type { StorybookConfig } from '@storybook/react-native-web-vite';

/** The phone's screens on react-native-web, as `pnpm test:stories` renders them. */
const config: StorybookConfig = {
  framework: '@storybook/react-native-web-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y'],
};

export default config;
