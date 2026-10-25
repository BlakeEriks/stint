/// <reference types="vite/client" />
import * as a11y from '@storybook/addon-a11y/preview';
import {
  composeStories,
  composeStory,
  setProjectAnnotations,
} from '@storybook/react-native-web-vite';
import { createElement } from 'react';
import { beforeAll, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as preview from '../../.storybook/preview';

/**
 * Every story is a test: it renders in Chromium at a phone's width, runs its
 * `play`, and fails on an accessibility violation.
 */
const annotations = setProjectAnnotations([a11y, preview]);
beforeAll(annotations.beforeAll);

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
        await page.viewport(390, 844);
        await Story.run();
      });
    }
  });
}

/* If an upgrade stopped the a11y check failing a story, every violation
   would turn into a report and the suite would stay green. */
test('the a11y check fails a story with a violation', async () => {
  const Unlabeled = composeStory(
    { render: () => createElement('input') },
    { title: 'Canary/A11y', component: () => null },
  );
  await expect(Unlabeled.run()).rejects.toThrow(/label/i);
});
