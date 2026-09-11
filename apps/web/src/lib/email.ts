/**
 * Email delivery.
 *
 * No provider has been chosen yet, so this is deliberately a seam rather than
 * a guess. `sendInvoiceEmail` performs every provider-independent step —
 * validation, rendering the PDF, composing the message — and only the final
 * transport call is pending.
 *
 * To wire one up (Resend, Postmark, SES): implement `deliver` below. Nothing
 * else in the route needs to change.
 */

import { ApiError } from './errors';

export interface OutboundEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachments: Array<{ filename: string; content: Uint8Array; contentType: string }>;
}

export interface EmailResult {
  delivered: boolean;
  /** Provider message id when delivered; null when no provider is configured. */
  messageId: string | null;
}

/** True once a provider is configured via environment. */
export function emailConfigured(): boolean {
  return Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_FROM);
}

export async function deliver(message: OutboundEmail): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER;

  if (!provider) {
    // Not an error the caller should crash on — the route decides whether
    // sending was required or whether marking-as-sent is enough.
    return { delivered: false, messageId: null };
  }

  switch (provider) {
    case 'resend': {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new ApiError('VALIDATION_FAILED', 'RESEND_API_KEY is not set');

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          attachments: message.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content).toString('base64'),
          })),
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new ApiError('VALIDATION_FAILED', 'Email provider rejected the message', {
          status: res.status,
          detail: detail.slice(0, 500),
        });
      }

      const body = (await res.json()) as { id?: string };
      return { delivered: true, messageId: body.id ?? null };
    }

    default:
      throw new ApiError('VALIDATION_FAILED', `Unknown EMAIL_PROVIDER: ${provider}`);
  }
}

export function composeInvoiceEmail(opts: {
  to: string;
  from: string;
  invoiceNumber: string;
  businessName: string | null;
  total: string;
  dueDate: string | null;
  pdf: Uint8Array;
}): OutboundEmail {
  const who = opts.businessName ?? 'Your contractor';
  const due = opts.dueDate ? `\nPayment is due ${opts.dueDate}.` : '';

  return {
    to: opts.to,
    from: opts.from,
    subject: `Invoice ${opts.invoiceNumber} from ${who}`,
    text:
      `Invoice ${opts.invoiceNumber} is attached.\n\n` +
      `Amount due: ${opts.total}${due}\n\n` +
      `Thank you,\n${who}`,
    attachments: [
      {
        filename: `${opts.invoiceNumber}.pdf`,
        content: opts.pdf,
        contentType: 'application/pdf',
      },
    ],
  };
}
