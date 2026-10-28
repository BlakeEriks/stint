import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { keys } from '@stint/client';
import type { ReactNode } from 'react';
import {
  TemplatePicker,
  useTemplateChoice,
} from '@/components/template-picker';

/** Two pickers on one setting, as Settings and New invoice share it. */
function Both() {
  const { template, choose } = useTemplateChoice();
  return (
    <>
      <div data-testid="settings">
        <TemplatePicker value={template} onChange={choose} size="card" />
      </div>
      <div data-testid="new">
        <TemplatePicker value={template} onChange={choose} size="mini" />
      </div>
    </>
  );
}

function setup(answer: (body: unknown) => Promise<Response>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(keys.settings(), { invoiceTemplate: 'standard' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? answer(JSON.parse(String(init.body)))
        : new Response(JSON.stringify({ invoiceTemplate: 'standard' })),
    ),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Both />, { wrapper });
}

const checked = (where: string) =>
  screen
    .getAllByRole('radio', { checked: true })
    .filter((r) => r.closest(`[data-testid="${where}"]`))
    .map((r) => (r as HTMLInputElement).value);

afterEach(() => vi.unstubAllGlobals());

describe('TemplatePicker', () => {
  it('selects at once, in both places, before the server answers', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    setup((body) => {
      sent.push(body);
      return new Promise(() => {}); // never answers
    });

    await user.click(screen.getAllByRole('radio', { name: /Classic/ })[1]!);

    expect(checked('settings')).toEqual(['classic']);
    expect(checked('new')).toEqual(['classic']);
    expect(sent).toEqual([{ invoiceTemplate: 'classic' }]);
  });

  it('a refused save puts the saved template back', async () => {
    const user = userEvent.setup();
    setup(
      async () =>
        new Response(
          JSON.stringify({ code: 'VALIDATION_FAILED', message: 'No.' }),
          { status: 422 },
        ),
    );

    await user.click(screen.getAllByRole('radio', { name: /Modern/ })[0]!);

    await waitFor(() => expect(checked('settings')).toEqual(['standard']));
    expect(checked('new')).toEqual(['standard']);
  });
});
