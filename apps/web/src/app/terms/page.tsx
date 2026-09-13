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
    <LegalPage title="Terms" updated="September 2026">
      <Clause heading="The short version">
        <p>
          Stint is a time tracking and invoicing tool for one person. It is
          free to use. It records what you tell it and produces invoices from
          that &mdash; it does not give you accounting, tax or legal advice,
          and the numbers on your invoices are your responsibility.
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

      <Clause heading="Price">
        <p>
          Stint is free. A paid option may be introduced later that removes the
          Stint mark from generated invoice PDFs. Nothing that affects whether
          you get paid &mdash; tracking, invoicing, or exporting your data
          &mdash; will be put behind a payment.
        </p>
        <p>
          If a paid option is introduced, you will not be charged for anything
          without agreeing to it first.
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
          account may be suspended for unlawful use or for behaviour that
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
