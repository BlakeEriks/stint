import { LegalPage, Clause, legalMetadata } from '../landing/legal';

export const metadata = legalMetadata('Terms');

/**
 * FIRST DRAFT — not reviewed by a lawyer.
 *
 * Two clauses matter more than the rest and should survive any redraft: the
 * one saying Stint is a record-keeping tool rather than an accountant, and
 * the one about what happens if the service shuts down. A billing tool that
 * is vague about the second is asking its users to gamble their tax records.
 */
export default function Page() {
  return (
    <LegalPage title="Terms" updated="October 2026">
      <Clause heading="The short version">
        <p>
          Stint is a time tracking and invoicing tool for one person. Tracking
          is free; downloading invoices is a paid plan. It records what you tell
          it and produces invoices from that &mdash; it does not give you
          accounting, tax or legal advice, and the numbers on your invoices are
          your responsibility.
        </p>
      </Clause>

      <Clause heading="Your account">
        <p>
          One account is for one person. Sign-in is by a one-time link sent to
          your email address, so keeping access to that address secure is what
          keeps your account secure.
        </p>
        <p>
          You are responsible for what you put into Stint and for having the
          right to bill the people you bill.
        </p>
      </Clause>

      <Clause heading="What Stint is not">
        <p>
          It is not an accountant, a bookkeeper, a tax service or a payment
          processor. It does not collect money on your behalf and it does not
          send your invoices &mdash; you download the PDF and send it yourself.
        </p>
        <p>
          Check your own invoices before sending them. Stint computes totals
          from the hours and rates you enter, and cannot know whether those are
          correct.
        </p>
      </Clause>

      <Clause heading="Price and billing">
        <p>
          Tracking time is free. Downloading invoices needs the paid plan, which
          costs $40 a year, billed yearly in advance, in US dollars. Payments
          are handled by Stripe; Stint never sees your card number.
        </p>
        <p>
          <strong className="text-primary">
            The paid plan renews automatically every year
          </strong>{' '}
          at the then-current price, charged to the card on file, until you
          cancel. You will get an email reminder before each renewal.
        </p>
        <p>
          Cancel any time, online, from Settings &rarr; Plan &rarr; Manage
          billing. You keep the paid plan until the end of the year you paid
          for, and you are not charged again.
        </p>
        <p>
          If you ask within 30 days of any charge, including a renewal, you get
          a full refund of that charge. After 30 days, payments are not
          refunded.
        </p>
        <p>
          If a renewal payment fails, it is retried over the following two weeks
          and you keep the paid plan meanwhile. If every retry fails, the
          subscription ends.
        </p>
        <p>
          A price change applies only from your next renewal, and you will be
          told at least 30 days before it. Prices do not include sales tax; none
          is charged today.
        </p>
        <p>
          Canceling, or a payment failing, never deletes or locks your records
          or the invoices you have already generated. Tracking and exporting
          your data stay free on every plan.
        </p>
      </Clause>

      <Clause heading="Your data is yours">
        <p>
          You keep ownership of everything you enter. Export it at any time, on
          any plan.
        </p>
      </Clause>

      <Clause heading="If the service ends">
        <p>
          Stint may be discontinued. If that happens, reasonable advance notice
          will be given &mdash; at least 30 days &mdash; with time to export
          your data first.
        </p>
        <p>
          Invoices you have already generated are PDFs you have downloaded, and
          they remain yours and usable regardless of what happens to Stint.
        </p>
      </Clause>

      <Clause heading="Ending your account">
        <p>
          You can stop using Stint and delete your account at any time. An
          account may be suspended for unlawful use or for behavior that
          threatens the service for other people.
        </p>
      </Clause>

      <Clause heading="No warranty, and limits">
        <p>
          Stint is provided as is, without warranties of any kind. It is not
          liable for indirect or consequential losses, including lost income or
          lost data, to the extent the law allows.
        </p>
        <p>
          Keep your own copies of anything you cannot afford to lose. Exports
          exist for exactly this reason.
        </p>
      </Clause>

      <Clause heading="Changes">
        <p>
          These terms may change. Material changes will be announced in the app
          before they take effect, and continuing to use Stint after that means
          accepting them.
        </p>
      </Clause>

      <Clause heading="Governing law">
        <p>
          These terms are governed by the laws of the United States and the
          state in which the service operator resides.
        </p>
      </Clause>
    </LegalPage>
  );
}
