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

/** The picker on Settings, which saves each press. */
function Picker() {
  const { template, choose } = useTemplateChoice();
  return <TemplatePicker value={template} onChange={choose} />;
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
  render(<Picker />, { wrapper });
}

const checked = () =>
  screen
    .getAllByRole('radio', { checked: true })
    .map((r) => (r as HTMLInputElement).value);

afterEach(() => vi.unstubAllGlobals());

describe('TemplatePicker', () => {
  it('selects at once, before the server answers', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    setup((body) => {
      sent.push(body);
      return new Promise(() => {}); // never answers
    });

    await user.click(screen.getByRole('radio', { name: /Classic/ }));

    expect(checked()).toEqual(['classic']);
    expect(sent).toEqual([{ invoiceTemplate: 'classic' }]);
  });

  it('Preview chooses nothing; Use in the preview does', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    setup((body) => {
      sent.push(body);
      return new Promise(() => {}); // never answers
    });

    await user.click(screen.getByRole('button', { name: 'Preview Modern' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(sent).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Use Modern' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(checked()).toEqual(['modern']);
    expect(sent).toEqual([{ invoiceTemplate: 'modern' }]);
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

    await user.click(screen.getByRole('radio', { name: /Modern/ }));

    await waitFor(() => expect(checked()).toEqual(['standard']));
  });
});
