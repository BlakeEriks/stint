import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMissing } from '@/lib/client/use-missing';

/** Two required fields; Save counts the presses that got through. */
function Form() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [saved, setSaved] = useState(0);
  const check = useMissing({
    a: a ? undefined : 'Enter a.',
    b: b ? undefined : 'Enter b.',
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (check.passes()) setSaved((n) => n + 1);
      }}
    >
      <input
        id="a"
        aria-label="a"
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <input
        id="b"
        aria-label="b"
        value={b}
        onChange={(e) => setB(e.target.value)}
      />
      <p>{[check.error('a'), check.error('b')].filter(Boolean).join(' ')}</p>
      <button type="submit">Save</button>
      <output>{saved}</output>
    </form>
  );
}

describe('useMissing', () => {
  it('says nothing until the press, then marks each missing field and focuses the first', async () => {
    const user = userEvent.setup();
    render(<Form />);
    expect(screen.queryByText(/Enter/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a. Enter b.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('a'));
    expect(screen.getByRole('status').textContent).toBe('0');
  });

  it('drops a message once its field is filled, and saves when none is left', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.type(screen.getByLabelText('a'), 'x');
    expect(screen.getByText('Enter b.')).toBeTruthy();

    await user.type(screen.getByLabelText('b'), 'y');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status').textContent).toBe('1');
  });
});
