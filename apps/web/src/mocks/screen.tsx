import type { Decorator } from '@storybook/nextjs-vite';
import { AppShell } from '@/components/app-shell';

/**
 * A route as the app renders it: inside the real frame, at its own path, so
 * the rail marks it and the back trail and filters read the URL they would.
 */
export function screen(pathname: string, query: Record<string, string> = {}) {
  const decorator: Decorator = (Story) => (
    <AppShell>
      <Story />
    </AppShell>
  );
  return {
    parameters: {
      layout: 'fullscreen',
      nextjs: { navigation: { pathname, query } },
    },
    decorators: [decorator],
  };
}
