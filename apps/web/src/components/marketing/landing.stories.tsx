import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import MarketingLayout from '@/app/landing/layout';
import LandingPage from '@/app/landing/page';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';
import { desktop, light, phone, tablet } from '@/mocks/screen';

/** The signed-out site, in its own layout. */
const meta = {
  title: 'Screens/Landing',
  component: LandingPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/landing' } },
  },
  decorators: [
    (Story) => (
      <MarketingLayout>
        <Story />
      </MarketingLayout>
    ),
  ],
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Both calls to action ask for an invite; only the header signs in. The
 * unbilled section shows the real home, not a drawing of it.
 */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      page.getAllByRole('button', { name: 'Request an invite' }),
    ).toHaveLength(2);
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin',
    );
    await expect(
      page.getByRole('img', { name: /Stint's home screen/ }),
    ).toBeVisible();
  },
};
export const Tablet: Story = { ...tablet };
export const Phone: Story = { ...phone };
/** Only for someone who chose light in the app; the page has no toggle. */
export const Light: Story = { ...light };

export const Privacy: Story = { ...desktop, render: () => <PrivacyPage /> };
export const Terms: Story = { ...desktop, render: () => <TermsPage /> };
