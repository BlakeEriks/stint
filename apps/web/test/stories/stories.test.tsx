/// <reference types="vite/client" />
import * as a11y from '@storybook/addon-a11y/preview';
import {
  composeStories,
  type composeStory,
  setProjectAnnotations,
} from '@storybook/nextjs-vite';
import { beforeAll, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as preview from '../../.storybook/preview';

/**
 * Every story is a test: it renders in Chromium at its own viewport, runs its
 * `play`, and fails on an accessibility violation (`a11y.test: 'error'` in
 * the preview).
 *
 * In Docker it is also compared, pixel for pixel, with its baseline in
 * `__screenshots__/` (`pnpm test:stories:docker`). Baselines are rendered on
 * Linux only, so a Mac run checks everything but the pixels. The viewport is
 * captured, as a person sees it: that includes a dialog or menu, which
 * renders in a portal outside the story's root, and stops at the fold on a
 * page that scrolls.
 */
const annotations = setProjectAnnotations([a11y, preview]);
beforeAll(annotations.beforeAll);

type Viewports = Record<string, { styles: { width: string; height: string } }>;
const viewports: Viewports = preview.default.parameters?.viewport?.options;

type StoriesModule = Parameters<typeof composeStories>[0];
type Story = ReturnType<typeof composeStory>;
const modules = import.meta.glob('../../src/**/*.stories.tsx', {
  eager: true,
}) as Record<string, StoriesModule>;

for (const [path, module] of Object.entries(modules)) {
  describe(path.replace('../../src/', ''), () => {
    const stories = Object.entries(composeStories(module)) as [string, Story][];
    for (const [name, Story] of stories) {
      test(name, async () => {
        // A story's id names its baseline, and without a `title` it is not
        // unique: every untitled `Default` would share one screenshot.
        expect(Story.id, `${path} needs a title`).not.toMatch(/^composedstory/);
        const size = viewports[Story.globals?.viewport?.value]?.styles;
        await page.viewport(
          size ? Number.parseInt(size.width, 10) : 1280,
          size ? Number.parseInt(size.height, 10) : 800,
        );
        await Story.run();
        if (
          import.meta.env.STORY_SCREENSHOTS &&
          Story.parameters.screenshot !== false
        )
          await expect(page).toMatchScreenshot(Story.id);
      });
    }
  });
}
