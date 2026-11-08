import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MutationNotice } from '@/components/mutation-notice';
import { SettingsForm } from '@/components/settings-form';
import { api, ApiError } from '@/lib/client/api';
import { settings } from '@/mocks/fixtures';

afterEach(() => vi.restoreAllMocks());

describe('SettingsForm', () => {
  /** No field is left to say why: the app-wide notice does, in the
      server's words for the field it refused. */
  it('says in the notice why a save refused after leaving failed', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue(settings());
    vi.spyOn(api, 'updateSettings').mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        message: 'Request body failed validation',
        details: {
          errors: [],
          properties: {
            businessEmail: { errors: ['An email like you@example.com.'] },
          },
        },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    render(<MutationNotice />, { wrapper });
    const form = render(<SettingsForm loaded={settings()} />, { wrapper });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'you@' },
    });
    form.unmount();

    expect(
      await screen.findByText(
        'Settings didn’t save: An email like you@example.com.',
      ),
    ).toBeTruthy();
  });
});
