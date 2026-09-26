import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BackLink, BackTrail, resetBackTrail } from '@/components/back-link';

const at = vi.hoisted(() => ({ pathname: '/', query: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => at.pathname,
  useSearchParams: () => new URLSearchParams(at.query),
}));

/** Walks the app through each URL, as the layout's `BackTrail` would see it. */
function visit(...urls: string[]) {
  const { rerender, unmount } = render(<BackTrail />);
  for (const url of urls) {
    const [pathname = '', query = ''] = url.split('?');
    at.pathname = pathname;
    at.query = query;
    rerender(<BackTrail />);
  }
  unmount();
}

function arrow(up: string, label: string) {
  render(
    <>
      <BackTrail />
      <BackLink up={up} label={label} />
    </>,
  );
  return screen.getByRole('link');
}

beforeEach(() => {
  resetBackTrail();
  at.pathname = '/';
  at.query = '';
});

describe('BackLink', () => {
  it('goes back to the section the record was opened from', () => {
    visit('/');
    at.pathname = '/invoices/inv-1';
    const link = arrow('/invoices', 'Invoices');
    expect(link).toHaveTextContent('← Home');
    expect(link).toHaveAttribute('href', '/');
  });

  it('keeps the filter the list was on', () => {
    visit('/invoices?status=paid');
    at.pathname = '/invoices/inv-1';
    at.query = '';
    expect(arrow('/invoices', 'Invoices')).toHaveAttribute(
      'href',
      '/invoices?status=paid',
    );
  });

  it('goes where the record sits when opened from outside the app', () => {
    at.pathname = '/invoices/inv-1';
    const link = arrow('/invoices', 'Invoices');
    expect(link).toHaveTextContent('← Invoices');
    expect(link).toHaveAttribute('href', '/invoices');
  });

  it('returns to the record a form was opened from', () => {
    visit('/projects', '/clients/c1');
    at.pathname = '/clients/c1/edit';
    const link = arrow('/clients/c1', 'Back');
    expect(link).toHaveTextContent('← Back');
    expect(link).toHaveAttribute('href', '/clients/c1');
  });

  it('goes back past the form a record was saved through', () => {
    visit('/projects', '/clients/c1', '/clients/c1/edit');
    at.pathname = '/clients/c1';
    const link = arrow('/clients', 'Clients');
    expect(link).toHaveTextContent('← Projects');
    expect(link).toHaveAttribute('href', '/projects');
  });
});
