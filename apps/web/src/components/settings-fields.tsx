'use client';

import { Input } from '@/components/ui/input';
import { EMAIL } from '@/lib/client/use-missing';
import { Field, textareaClass } from './field';

/*
 * The Settings fields New invoice also asks for. Settings autosaves them and
 * each dialog saves them on Save, but both render the group and check it by
 * the rule here, so the two can't drift apart.
 */

/** The next number's check before a request; the server refuses one an
    invoice holds, or one past the ceiling, and says why. */
export function nextNumberError(next: string) {
  const n = Number(next);
  return Number.isInteger(n) && n > 0
    ? undefined
    : 'Enter a whole number over zero.';
}

export function emailError(email: string) {
  const trimmed = email.trim();
  if (trimmed === '') return 'Enter your email.';
  return EMAIL.test(trimmed)
    ? undefined
    : 'Enter an email like you@example.com.';
}

/** Prefix, then Next number, in reading and tab order, as the invoice
    prints them. Laid out by the caller. */
export function NumberFields({
  id,
  prefix,
  next,
  onPrefix,
  onNext,
  nextError,
  readOnly,
  autoFocus,
}: {
  id: string;
  prefix: string;
  next: string;
  onPrefix: (prefix: string) => void;
  onNext: (next: string) => void;
  nextError: string | undefined;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field
        label="Prefix"
        htmlFor={`${id}-prefix`}
        className="flex-1 basis-40"
      >
        <Input
          id={`${id}-prefix`}
          placeholder="INV-"
          maxLength={20}
          value={prefix}
          readOnly={readOnly}
          onChange={(e) => onPrefix(e.target.value)}
        />
      </Field>
      <Field
        label="Next number"
        htmlFor={`${id}-next`}
        className="flex-1 basis-40"
        error={nextError}
      >
        <Input
          id={`${id}-next`}
          type="number"
          step="1"
          autoFocus={autoFocus}
          value={next}
          readOnly={readOnly}
          onChange={(e) => onNext(e.target.value)}
        />
      </Field>
    </>
  );
}

export type Identity = { name: string; email: string; address: string };

/** Who the invoice is from. `required` where the invoice can't go without
    a name and email. */
export function IdentityFields({
  id,
  value,
  onChange,
  error,
  required,
  readOnly,
  autoFocus,
}: {
  id: string;
  value: Identity;
  onChange: (key: keyof Identity, text: string) => void;
  error: (key: 'name' | 'email') => string | undefined;
  required?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field
        label="Business name"
        htmlFor={`${id}-name`}
        required={required}
        error={error('name')}
      >
        <Input
          id={`${id}-name`}
          autoFocus={autoFocus}
          placeholder="Your name or LLC"
          value={value.name}
          readOnly={readOnly}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </Field>
      <Field
        label="Email"
        htmlFor={`${id}-email`}
        required={required}
        error={error('email')}
      >
        <Input
          id={`${id}-email`}
          type="email"
          placeholder="you@example.com"
          value={value.email}
          readOnly={readOnly}
          onChange={(e) => onChange('email', e.target.value)}
        />
      </Field>
      <Field label="Address" htmlFor={`${id}-address`}>
        <textarea
          id={`${id}-address`}
          rows={3}
          placeholder={'123 Main St\nAustin, TX 78701'}
          value={value.address}
          readOnly={readOnly}
          onChange={(e) => onChange('address', e.target.value)}
          className={textareaClass}
        />
      </Field>
    </>
  );
}
