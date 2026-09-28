import type { Preview } from '@storybook/nextjs-vite';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { useEffect } from 'react';
import { fontVariables } from '@/app/fonts';
import { Providers } from '@/components/providers';
import '@/styles/globals.css';

const preview: Preview = {
  /* Components that read the server get it from MSW: a story's
     `parameters.msw` handlers answer `/api/v1/*`, and anything unhandled
     fails loudly rather than reaching a real server. */
  loaders: [
    mswLoader(async () => {
      const worker = setupWorker();
      await worker.start({ onUnhandledRequest: 'error', quiet: true });
      return worker;
    }),
  ],
  decorators: [
    (Story, { globals }) => {
      // What layout.tsx does for the app: font variables and the theme on
      // <html>, so tokens and `color-scheme` resolve as they do there.
      useEffect(() => {
        const html = document.documentElement;
        html.classList.add(...fontVariables.split(' '));
        html.setAttribute('data-theme', globals.theme);
        html.style.colorScheme = globals.theme;
      }, [globals.theme]);
      return (
        <Providers>
          <Story />
        </Providers>
      );
    },
  ],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: { icon: 'mirror', items: ['dark', 'light'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'dark' },
  parameters: {
    layout: 'padded',
    // The widths the app's layout changes at: below `sm`, `md`, and `xl`.
    viewport: {
      options: {
        phone: { name: 'Phone', styles: { width: '390px', height: '844px' } },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1280px', height: '800px' },
        },
      },
    },
    a11y: { test: 'error' },
  },
};

export default preview;
