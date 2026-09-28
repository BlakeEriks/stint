import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const real = resolve(import.meta.dirname, '../src/lib/client/supabase.ts');
const fake = resolve(import.meta.dirname, '../src/mocks/supabase.ts');

/**
 * What Storybook and the story tests swap out of the app, in one place for
 * both: `sb.mock` does nothing under portable stories, so a Vite plugin is
 * the one mechanism the two share.
 *
 * - The Supabase browser client becomes `src/mocks/supabase.ts`. Matched on
 *   the resolved path, so `@/lib/client/supabase` and `./supabase` both land
 *   on it and the server-side `src/lib/supabase.ts` never does.
 * - The build label reads "storybook" rather than a commit, which a
 *   story has none of.
 */
export function storyMocks(): Plugin[] {
  return [
    {
      name: 'stint:mock-supabase',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!source.includes('supabase') || importer === fake) return null;
        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        return resolved?.id === real ? fake : null;
      },
    },
    {
      name: 'stint:story-version',
      enforce: 'post',
      config: () => ({
        define: { 'process.env.NEXT_PUBLIC_APP_VERSION': '"storybook"' },
      }),
    },
  ];
}
