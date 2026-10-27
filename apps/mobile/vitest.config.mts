import { storybookReactNativeWeb } from '@storybook/react-native-web-vite/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Every story rendered in real Chromium on react-native-web, with its
 * accessibility check, through Storybook's portable-stories API, as the web
 * app's `stories` project does.
 */
export default defineConfig({
  plugins: [storybookReactNativeWeb()],
  // The a11y addon fails a test on a violation only in a standalone run.
  define: { 'import.meta.env.VITEST_STORYBOOK': '"false"' },
  optimizeDeps: {
    entries: ['src/**/*.stories.tsx', '.storybook/preview.tsx'],
  },
  test: {
    include: ['test/stories/**/*.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        contextOptions: { locale: 'en-US', reducedMotion: 'reduce' },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
