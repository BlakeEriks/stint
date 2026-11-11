import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const src = (path: string) => resolve(import.meta.dirname, '../src', path);
/** Each real module, by the name in its path, and what replaces it. */
const FAKES = [
  ['supabase', src('lib/client/supabase.ts'), src('mocks/supabase.ts')],
] as const;

const INVITE_FORM_URL = 'https://formspree.io/f/storybook';

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
 * - The invite form posts to a stand-in Formspree URL that each story
 *   answers with MSW, so no story reaches a real form.
 */
export function storyMocks(): Plugin[] {
  return [
    {
      name: 'stint:mock-modules',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        const match = FAKES.find(
          ([name, , fake]) => source.includes(name) && importer !== fake,
        );
        if (!match) return null;
        const resolved = await this.resolve(source, importer, {
          ...options,
          skipSelf: true,
        });
        return resolved?.id === match[1] ? match[2] : null;
      },
    },
    {
      name: 'stint:story-version',
      enforce: 'post',
      config: () => ({
        define: {
          'process.env.NEXT_PUBLIC_APP_VERSION': '"storybook"',
          'process.env.NEXT_PUBLIC_INVITE_FORM_URL':
            JSON.stringify(INVITE_FORM_URL),
        },
      }),
    },
  ];
}
