import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Feedback } from '@/components/feedback';
import { MutationNotice } from '@/components/mutation-notice';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/invoices',
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Answers each POST with `answer()`, and returns the bodies sent. */
function serve(answer: () => Promise<Response> | Response) {
  const sent: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return answer();
    }),
  );
  return sent;
}

const created = () =>
  new Response(JSON.stringify({ id: 'x' }), { status: 201 });

async function open() {
  const user = userEvent.setup();
  render(
    <>
      <Feedback />
      <MutationNotice />
    </>,
    { wrapper },
  );
  await user.click(screen.getByRole('button', { name: 'Feedback' }));
  return { user, box: await screen.findByRole('textbox') };
}

afterEach(() => vi.unstubAllGlobals());

describe('Feedback', () => {
  it('cannot send an empty or blank message', async () => {
    serve(created);
    const { user, box } = await open();
    const send = screen.getByRole('button', { name: 'Send' });

    expect(send).toBeDisabled();
    await user.type(box, '   ');
    expect(send).toBeDisabled();
    await user.type(box, 'x');
    expect(send).toBeEnabled();
  });

  it('counts toward 2,000 and stops there', async () => {
    serve(created);
    const { user, box } = await open();

    await user.type(box, 'Hello');
    expect(screen.getByText(/^5 \/ 2,000/)).toBeInTheDocument();
    expect(box).toHaveAttribute('maxLength', '2000');
  });

  it('sends the message with the screen and version, then says it was sent', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.1.0-alpha.3');
    const sent = serve(created);
    const { user, box } = await open();

    await user.type(box, 'The total looks short.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Thanks. Feedback sent.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      message: 'The total looks short.',
      screen: '/invoices',
      client: 'web',
      appVersion: '0.1.0-alpha.3',
    });
    vi.unstubAllEnvs();
  });

  it('locks the form while sending', async () => {
    serve(() => new Promise<Response>(() => {}));
    const { user, box } = await open();

    await user.type(box, 'Still waiting');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByRole('button', { name: /Sending/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(box).toHaveAttribute('readonly');
  });

  it('keeps the message and says why when a send fails, and a retry reuses its id', async () => {
    let fail = true;
    const sent = serve(() =>
      fail
        ? new Response(JSON.stringify({ code: 'INTERNAL', message: 'x' }), {
            status: 500,
          })
        : created(),
    );
    const { user, box } = await open();

    await user.type(box, 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t send. Your message is still here. Try again.',
    );
    expect(screen.getByRole('textbox')).toHaveValue('Keep me');

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.id).toBe(sent[0]?.id);
  });
});
