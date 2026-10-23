/**
 * Mail to the user, never to a client (docs/positioning.md). Through
 * Resend's API, which already sends sign-in links, or Mailpit's locally.
 */
export async function sendMail(mail: {
  to: string;
  subject: string;
  text: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const res = key
    ? await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
      })
    : await fetch(`${mailpit()}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: 'notices@localhost.test', Name: 'Stint' },
          To: [{ Email: mail.to }],
          Subject: mail.subject,
          Text: mail.text,
        }),
      });
  if (!res.ok) throw new Error(`Mail was refused: ${res.status}`);
}

function mailpit() {
  const url = process.env.MAILPIT_URL;
  if (!url) throw new Error('Set RESEND_API_KEY, or MAILPIT_URL locally');
  return url;
}
