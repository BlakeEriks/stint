/// <reference types="vite/client" />
import * as a11y from '@storybook/addon-a11y/preview';
import {
  composeStories,
  composeStory,
  setProjectAnnotations,
} from '@storybook/nextjs-vite';
import { beforeAll, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as preview from '../../.storybook/preview';

/**
 * Every story is a test: it renders in Chromium at its own viewport, runs its
 * `play`, and fails on an accessibility violation (`a11y.test: 'error'` in
 * the preview).
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
        const name = Story.globals?.viewport?.value;
        const size = viewports[name]?.styles;
        // A misspelled viewport would silently render at desktop.
        if (name && !size) throw new Error(`No viewport named "${name}"`);
        await page.viewport(
          size ? Number.parseInt(size.width, 10) : 1280,
          size ? Number.parseInt(size.height, 10) : 800,
        );
        await Story.run();
      });
    }
  });
}

/* The a11y check fails a test only while `VITEST_STORYBOOK` reaches the addon
   as "false" (`vitest.config.mts`). If an upgrade stopped that, every
   violation would turn into a report and the suite would stay green, so a
   known violation has to fail. */
test('the a11y check fails a story with a violation', async () => {
  const Unlabeled = composeStory(
    { render: () => <input /> },
    { title: 'Canary/A11y', component: () => null },
  );
  await expect(Unlabeled.run()).rejects.toThrow(/label/i);
});

/* Radix keeps a closed menu or dialog mounted until its exit animation ends,
   so an animation here leaves it on the page for the next query to find. */
test('a closed menu or dialog does not animate under reduced motion', () => {
  const closed = document.createElement('div');
  closed.dataset.state = 'closed';
  closed.className = 'data-[state=closed]:animate-out';
  document.body.append(closed);
  expect(getComputedStyle(closed).animationName).toBe('none');
  closed.remove();
});
