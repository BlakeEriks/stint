import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteRequest } from '@/components/marketing/invite-request';

const ENDPOINT = 'https://formspree.io/f/test';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_INVITE_FORM_URL', ENDPOINT);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function send(address = 'new@example.com') {
  const user = userEvent.setup();
  render(<InviteRequest />);
  await user.type(screen.getByLabelText('Email'), address);
  await user.click(screen.getByRole('button', { name: 'Request an invite' }));
}

describe('InviteRequest', () => {
  it('posts the address to the form service, asking for JSON', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await send();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init = {}] = fetchMock.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    // Without it, Formspree answers with its own HTML page.
    expect(new Headers(init.headers).get('Accept')).toBe('application/json');
    expect((init.body as FormData).get('email')).toBe('new@example.com');
  });

  it('shows a pending button while the request is in flight', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    await send();

    const button = await screen.findByRole('button', { name: 'Sending…' });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  });

  it('confirms in place of the form once the service accepts it', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await send();

    expect(await screen.findByText('You’re on the list.')).toBeInTheDocument();
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('keeps the address and says it didn’t send when the service refuses', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ errors: [{ message: 'nope' }] }, { status: 422 }),
    );
    await send();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /didn’t send.*try again/i,
    );
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
    expect(
      screen.getByRole('button', { name: 'Request an invite' }),
    ).toBeEnabled();
  });

  it('keeps the address and says it didn’t send when the service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await send();

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t send/i);
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com');
  });

  it('says it didn’t send when no form service is configured', async () => {
    // A preview has no endpoint; posting to the page itself could answer 200.
    vi.stubEnv('NEXT_PUBLIC_INVITE_FORM_URL', '');
    await send();
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t send/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing for an address that isn’t an email', async () => {
    await send('not-an-email');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toBeInvalid();
  });

  it('is a real form, so the address still reaches the list with JavaScript off', () => {
    render(<InviteRequest />);
    const form = screen.getByLabelText('Email').closest('form')!;
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', ENDPOINT);
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email');
  });
});
